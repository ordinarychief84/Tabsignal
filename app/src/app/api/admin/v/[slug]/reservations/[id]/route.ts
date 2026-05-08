import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

const PatchBody = z.object({
  status: z.enum(["PENDING", "ARRIVED", "SEATED", "NO_SHOW", "CANCELED"]),
  tableId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const reservation = await db.reservation.findFirst({
    where: { id: ctx.params.id, venueId: gate.venueId },
  });
  if (!reservation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (parsed.tableId) {
    const table = await db.table.findUnique({ where: { id: parsed.tableId }, select: { venueId: true } });
    if (!table || table.venueId !== gate.venueId) {
      return NextResponse.json({ error: "INVALID_TABLE" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = { status: parsed.status };
  if (parsed.tableId !== undefined) data.tableId = parsed.tableId;
  if (parsed.status === "ARRIVED" && !reservation.arrivedAt) data.arrivedAt = new Date();
  if (parsed.status === "SEATED" && !reservation.seatedAt) data.seatedAt = new Date();

  await db.reservation.update({ where: { id: reservation.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const reservation = await db.reservation.findFirst({
    where: { id: ctx.params.id, venueId: gate.venueId },
    select: { id: true },
  });
  if (!reservation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.reservation.update({ where: { id: reservation.id }, data: { status: "CANCELED" } });
  return NextResponse.json({ ok: true });
}
