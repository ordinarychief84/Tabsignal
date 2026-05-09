import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { quoteWait } from "@/lib/reservations";
import { normalizePhone } from "@/lib/sms";

const Body = z.object({
  partySize: z.number().int().min(1).max(20),
  guestName: z.string().min(1).max(120),
  guestPhone: z.string().min(7).max(40),
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

  // Already on the list? Refuse rather than duplicate (a refresh-spam
  // guard).
  const existing = await db.waitlist.findFirst({
    where: { venueId: gate.venueId, guestPhone: phone, status: "WAITING" },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "ALREADY_ON_LIST", id: existing.id }, { status: 409 });

  const ahead = await db.waitlist.count({
    where: { venueId: gate.venueId, status: "WAITING" },
  });
  const quotedWaitMin = quoteWait(ahead, parsed.partySize);

  const entry = await db.waitlist.create({
    data: {
      venueId: gate.venueId,
      partySize: parsed.partySize,
      guestName: parsed.guestName,
      guestPhone: phone,
      quotedWaitMin,
    },
  });

  return NextResponse.json({
    id: entry.id,
    position: ahead + 1,
    quotedWaitMin,
  });
}

// Public position lookup by phone (no enumeration risk).
export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const url = new URL(req.url);
  const phoneParam = url.searchParams.get("phone");
  if (!phoneParam) return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 });
  const phone = normalizePhone(phoneParam);
  if (!phone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });

  const entry = await db.waitlist.findFirst({
    where: { venueId: gate.venueId, guestPhone: phone, status: "WAITING" },
    select: { id: true, joinedAt: true, partySize: true, guestName: true, quotedWaitMin: true },
  });
  if (!entry) return NextResponse.json({ error: "NOT_ON_LIST" }, { status: 404 });

  const ahead = await db.waitlist.count({
    where: { venueId: gate.venueId, status: "WAITING", joinedAt: { lt: entry.joinedAt } },
  });

  return NextResponse.json({
    id: entry.id,
    position: ahead + 1,
    partySize: entry.partySize,
    guestName: entry.guestName,
    quotedWaitMin: entry.quotedWaitMin,
  });
}
