import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";

// Guest read by id + guestCode prefix. Using the short prefix mirrors
// the SMS code so guests can re-find their booking from the message.
export async function GET(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.toLowerCase() ?? "";
  if (!code) return NextResponse.json({ error: "CODE_REQUIRED" }, { status: 400 });

  const reservation = await db.reservation.findFirst({
    where: { id: ctx.params.id, venueId: gate.venueId },
    select: {
      id: true, guestCode: true, status: true, startsAt: true, endsAt: true,
      partySize: true, guestName: true, notes: true,
    },
  });
  if (!reservation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reservation.guestCode.toLowerCase().startsWith(code)) {
    return NextResponse.json({ error: "INVALID_CODE" }, { status: 403 });
  }

  return NextResponse.json({
    id: reservation.id,
    status: reservation.status,
    startsAt: reservation.startsAt.toISOString(),
    endsAt: reservation.endsAt.toISOString(),
    partySize: reservation.partySize,
    guestName: reservation.guestName,
    notes: reservation.notes,
  });
}

// Guest cancel.
export async function DELETE(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.toLowerCase() ?? "";
  if (!code) return NextResponse.json({ error: "CODE_REQUIRED" }, { status: 400 });

  const reservation = await db.reservation.findFirst({
    where: { id: ctx.params.id, venueId: gate.venueId },
    select: { id: true, guestCode: true, status: true },
  });
  if (!reservation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!reservation.guestCode.toLowerCase().startsWith(code)) {
    return NextResponse.json({ error: "INVALID_CODE" }, { status: 403 });
  }
  if (reservation.status === "SEATED" || reservation.status === "ARRIVED") {
    return NextResponse.json({ error: "ALREADY_AT_VENUE" }, { status: 410 });
  }

  await db.reservation.update({
    where: { id: reservation.id },
    data: { status: "CANCELED" },
  });
  return NextResponse.json({ ok: true });
}
