import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { checkConflict, rateCheck } from "@/lib/reservations";
import { sendSms, normalizePhone } from "@/lib/sms";

const Body = z.object({
  partySize: z.number().int().min(1).max(20),
  startsAt: z.string().datetime(),
  // Default 90 min window. Manager can adjust later.
  endsAt: z.string().datetime().optional(),
  guestName: z.string().min(1).max(120),
  guestPhone: z.string().min(7).max(40),
  notes: z.string().max(500).optional(),
  zone: z.string().max(40).optional(),
  tableId: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json({ error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.guestPhone);
  if (!phone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });

  if (!rateCheck(ctx.params.slug, phone)) {
    return NextResponse.json({ error: "RATE_LIMITED", detail: "Too many bookings recently. Try again in an hour." }, { status: 429 });
  }

  const startsAt = new Date(parsed.startsAt);
  const endsAt = parsed.endsAt
    ? new Date(parsed.endsAt)
    : new Date(startsAt.getTime() + 90 * 60_000);

  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: "INVALID_WINDOW" }, { status: 400 });
  }

  // If tableId provided, ensure it belongs to this venue.
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
    return NextResponse.json(
      { error: "CONFLICT", detail: conflict.reason },
      { status: 409 }
    );
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

  // SMS courtesy. Booking is confirmed regardless of SMS outcome.
  const formatted = startsAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  void sendSms(
    phone,
    `Reservation confirmed at TabCall venue for ${parsed.partySize} on ${formatted}. Code: ${reservation.guestCode.slice(0, 6)}`
  );

  return NextResponse.json({
    id: reservation.id,
    guestCode: reservation.guestCode,
    startsAt: reservation.startsAt.toISOString(),
    endsAt: reservation.endsAt.toISOString(),
    status: reservation.status,
  });
}
