import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { checkConflict } from "@/lib/reservations";
import { normalizePhone } from "@/lib/sms";

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  // Default = today (server local).
  const date = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const reservations = await db.reservation.findMany({
    where: {
      venueId: gate.venueId,
      startsAt: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { startsAt: "asc" },
    include: { table: { select: { id: true, label: true } } },
  });

  return NextResponse.json({
    date: dayStart.toISOString().slice(0, 10),
    reservations: reservations.map(r => ({
      id: r.id,
      partySize: r.partySize,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      tableId: r.tableId,
      tableLabel: r.table?.label ?? null,
      zone: r.zone,
      notes: r.notes,
      arrivedAt: r.arrivedAt?.toISOString() ?? null,
      seatedAt: r.seatedAt?.toISOString() ?? null,
    })),
  });
}

const PostBody = z.object({
  partySize: z.number().int().min(1).max(50),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  guestName: z.string().min(1).max(120),
  guestPhone: z.string().min(7).max(40),
  notes: z.string().max(500).optional(),
  zone: z.string().max(40).optional(),
  tableId: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PostBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const phone = normalizePhone(parsed.guestPhone);
  if (!phone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });

  const startsAt = new Date(parsed.startsAt);
  const endsAt = parsed.endsAt ? new Date(parsed.endsAt) : new Date(startsAt.getTime() + 90 * 60_000);

  if (parsed.tableId) {
    const table = await db.table.findUnique({ where: { id: parsed.tableId }, select: { venueId: true } });
    if (!table || table.venueId !== gate.venueId) {
      return NextResponse.json({ error: "INVALID_TABLE" }, { status: 400 });
    }
  }

  const conflict = await checkConflict({
    venueId: gate.venueId,
    tableId: parsed.tableId ?? null,
    startsAt,
    endsAt,
    partySize: parsed.partySize,
  });
  if (!conflict.ok) {
    return NextResponse.json({ error: "CONFLICT", detail: conflict.reason }, { status: 409 });
  }

  const reservation = await db.reservation.create({
    data: {
      venueId: gate.venueId,
      tableId: parsed.tableId ?? null,
      zone: parsed.zone ?? null,
      partySize: parsed.partySize,
      startsAt,
      endsAt,
      guestName: parsed.guestName,
      guestPhone: phone,
      notes: parsed.notes ?? null,
    },
  });

  return NextResponse.json({ id: reservation.id });
}
