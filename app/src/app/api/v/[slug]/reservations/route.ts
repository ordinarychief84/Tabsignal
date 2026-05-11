import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { checkConflict, rateCheck } from "@/lib/reservations";
import { sendSms, normalizePhone } from "@/lib/sms";
import { sendEmail } from "@/lib/email/send";
import { venueAlertRecipients } from "@/lib/email/recipients";

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
  const venue = await db.venue.findUnique({ where: { id: gate.venueId }, select: { name: true } });
  const venueName = venue?.name ?? "TabCall venue";
  const codeShort = reservation.guestCode.slice(0, 6);
  void sendSms(
    phone,
    `Reservation confirmed at ${venueName} for ${parsed.partySize} on ${formatted}. Code: ${codeShort}`
  );

  // Email the venue's alert recipients (manager + owners) so they have a
  // copy in their inbox without needing to refresh the reservations page.
  // Fire-and-forget; never break the booking on email failure.
  void (async () => {
    const to = await venueAlertRecipients(gate.venueId);
    if (to.length === 0) return;
    // Guest-controlled fields (guestName, phone, zone, notes) are escaped
    // before being interpolated into the manager-facing email body —
    // otherwise a hostile booking could inject phishing links / hidden
    // tracker pixels / fake CTAs into the operator's inbox.
    const safeVenue = escapeHtml(venueName);
    const safeGuest = escapeHtml(parsed.guestName);
    const safePhone = escapeHtml(phone);
    const safeZone = parsed.zone ? escapeHtml(parsed.zone) : null;
    const safeNotes = parsed.notes ? escapeHtml(parsed.notes) : null;
    const safeWhen = escapeHtml(formatted);
    const safeCode = escapeHtml(codeShort);
    const subject = `[${venueName}] New reservation · ${formatted} · ${parsed.partySize} · ${parsed.guestName}`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0E0F1A;background:#F8F6F1;padding:24px;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8B6F4E;">${safeVenue}</p>
        <h2 style="margin:0 0 12px;font-weight:500;">New reservation</h2>
        <p style="margin:0 0 6px;"><strong>Guest:</strong> ${safeGuest} (${safePhone})</p>
        <p style="margin:0 0 6px;"><strong>Party:</strong> ${parsed.partySize}</p>
        <p style="margin:0 0 6px;"><strong>When:</strong> ${safeWhen}</p>
        ${safeZone ? `<p style="margin:0 0 6px;"><strong>Zone:</strong> ${safeZone}</p>` : ""}
        ${safeNotes ? `<p style="margin:0 0 6px;"><strong>Notes:</strong> ${safeNotes}</p>` : ""}
        <p style="margin:12px 0 0;font-size:11px;color:#8B6F4E;">Code: ${safeCode}</p>
      </div>
    `.trim();
    const text = `${venueName} — new reservation\n\nGuest: ${parsed.guestName} (${phone})\nParty: ${parsed.partySize}\nWhen: ${formatted}\n${parsed.zone ? `Zone: ${parsed.zone}\n` : ""}${parsed.notes ? `Notes: ${parsed.notes}\n` : ""}Code: ${codeShort}`;
    try {
      await sendEmail({ to, subject, html, text });
    } catch (err) {
      console.warn("[reservation] manager email failed", err);
    }
  })();

  return NextResponse.json({
    id: reservation.id,
    guestCode: reservation.guestCode,
    startsAt: reservation.startsAt.toISOString(),
    endsAt: reservation.endsAt.toISOString(),
    status: reservation.status,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
