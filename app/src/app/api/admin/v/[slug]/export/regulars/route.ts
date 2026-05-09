import { gateAdminRoute } from "@/lib/plan-gate";
import { listRegulars } from "@/lib/regulars";
import { csv, csvResponseHeaders } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  // Pro-gated — same as the regulars page that surfaces this data.
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return new Response(JSON.stringify(gate.body), { status: gate.status });

  const rows = await listRegulars(gate.venueId, 5000);
  const out = csv([
    ["profileId", "displayName", "phone", "visits", "spendCents", "spendUsd", "recencyDays", "score"],
    ...rows.map(r => [
      r.profileId,
      r.displayName ?? "",
      r.phone,
      r.visits,
      r.spendCents,
      (r.spendCents / 100).toFixed(2),
      r.recencyDays ?? "",
      r.score,
    ]),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(out, {
    headers: csvResponseHeaders(`tabcall-regulars-${ctx.params.slug}-${stamp}.csv`),
  });
}
