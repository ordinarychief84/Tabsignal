import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { csv, csvResponseHeaders } from "@/lib/csv";
import { parseLineItems, totalsFor } from "@/lib/bill";

export const dynamic = "force-dynamic";

// Sessions export: paid sessions in the last 90 days. Useful for the
// venue's accountant — totals + tip + tax per session. Growth-gated
// because Free/Starter venues already have this in their POS.
export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth");
  if (!gate.ok) return new Response(JSON.stringify(gate.body), { status: gate.status });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? "90")));
  const since = new Date(Date.now() - days * 86_400_000);

  const venue = await db.venue.findUnique({
    where: { id: gate.venueId },
    select: { zipCode: true, slug: true },
  });
  if (!venue) return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });

  const sessions = await db.guestSession.findMany({
    where: { venueId: gate.venueId, paidAt: { gte: since } },
    orderBy: { paidAt: "asc" },
    select: {
      id: true,
      paidAt: true,
      tipPercent: true,
      lineItems: true,
      stripePaymentIntentId: true,
      table: { select: { label: true } },
    },
    take: 10_000,
  });

  const out = csv([
    ["sessionId", "paidAtIso", "table", "subtotalUsd", "taxUsd", "tipUsd", "totalUsd", "tipPercent", "stripePaymentIntent"],
    ...sessions.map(s => {
      const items = parseLineItems(s.lineItems);
      const tip = typeof s.tipPercent === "number" ? s.tipPercent : 0;
      const t = totalsFor(items, venue.zipCode ?? "", tip);
      return [
        s.id,
        s.paidAt!.toISOString(),
        s.table.label,
        (t.subtotalCents / 100).toFixed(2),
        (t.taxCents / 100).toFixed(2),
        (t.tipCents / 100).toFixed(2),
        (t.totalCents / 100).toFixed(2),
        tip,
        s.stripePaymentIntentId ?? "",
      ];
    }),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(out, {
    headers: csvResponseHeaders(`tabcall-sessions-${venue.slug}-${stamp}.csv`),
  });
}
