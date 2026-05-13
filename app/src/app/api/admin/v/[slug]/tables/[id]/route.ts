import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

const PatchBody = z.object({
  label: z.string().min(1).max(40).optional(),
  zone: z.string().max(40).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "tables.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const table = await db.table.findUnique({ where: { id: ctx.params.id } });
  if (!table || table.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Label uniqueness within the venue.
  if (parsed.label && parsed.label !== table.label) {
    const taken = await db.table.findUnique({
      where: { venueId_label: { venueId: gate.venueId, label: parsed.label } },
    });
    if (taken) return NextResponse.json({ error: "LABEL_TAKEN" }, { status: 409 });
  }

  const data: Record<string, string | null> = {};
  if (parsed.label !== undefined) data.label = parsed.label;
  if (parsed.zone !== undefined) data.zone = parsed.zone;

  await db.table.update({ where: { id: table.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "tables.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const table = await db.table.findUnique({
    where: { id: ctx.params.id },
    include: { _count: { select: { sessions: true, requests: true, preOrders: true } } },
  });
  if (!table || table.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Refuse if there's any active state — dropping a table mid-shift would
  // strand sessions/requests pointing at it. Owner can either rename or
  // wait until the tab clears.
  const active = await db.guestSession.count({
    where: { tableId: table.id, paidAt: null, expiresAt: { gt: new Date() } },
  });
  if (active > 0) {
    return NextResponse.json(
      { error: "TABLE_IN_USE", detail: `${active} active tab${active === 1 ? "" : "s"} on this table.` },
      { status: 409 }
    );
  }
  // Historical sessions: keep them. Cascade-on-delete would lose audit
  // trail. Manager rarely needs delete; rename is the common path.
  if (table._count.sessions > 0 || table._count.requests > 0 || table._count.preOrders > 0) {
    return NextResponse.json(
      { error: "TABLE_HAS_HISTORY", detail: "Table has past activity. Rename instead. Deleting would orphan historical records." },
      { status: 409 }
    );
  }

  await db.table.delete({ where: { id: table.id } });
  return NextResponse.json({ ok: true });
}
