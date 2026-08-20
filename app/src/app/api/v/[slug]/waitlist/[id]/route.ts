import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { normalizePhone } from "@/lib/sms";
import { rateLimitAsync } from "@/lib/rate-limit";

const Body = z.object({ phone: z.string().min(7).max(40) });

/**
 * Guest leave-the-list. The phone number is proof of ownership, and it
 * travels in the BODY rather than a query string: URLs are written to
 * Vercel and proxy access logs and leak through Referer, and a guest's
 * phone number has no business in either.
 */
export async function DELETE(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Unauthenticated endpoint that compares a phone number — rate-limit it
  // so it can't be walked to confirm whether a given number is on a list.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await rateLimitAsync(`waitlist:leave:${ctx.params.id}:${ip}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 }); }
  const phone = normalizePhone(parsed.phone);
  if (!phone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });

  const entry = await db.waitlist.findFirst({
    where: { id: ctx.params.id, venueId: gate.venueId },
    select: { id: true, guestPhone: true, status: true },
  });
  if (!entry) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (entry.guestPhone !== phone) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (entry.status !== "WAITING") {
    return NextResponse.json({ error: "ALREADY_CLOSED" }, { status: 410 });
  }

  await db.waitlist.update({
    where: { id: entry.id },
    data: { status: "ABANDONED" },
  });
  return NextResponse.json({ ok: true });
}
