import { NextResponse } from "next/server";
import { z } from "zod";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { issueOtp } from "@/lib/sms-otp";
import { normalizePhone } from "@/lib/sms";
import { rateLimitAsync } from "@/lib/rate-limit";

const Body = z.object({ phone: z.string().min(7).max(40) });

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Per-IP and per-slug rate limit BEFORE we touch the DB or Twilio.
  // issueOtp throttles per-phone internally, but a single attacker can
  // rotate phone numbers to burn Twilio budget and spam strangers. Cap
  // bursts at the IP layer (10/min) and the venue layer (60/min) so a
  // crowded venue still works while spam is choked off.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipGate = await rateLimitAsync(`otp:ip:${ip}`, { windowMs: 60_000, max: 10 });
  if (!ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: ipGate.retryAfterMs },
      { status: 429 }
    );
  }
  const slugGate = await rateLimitAsync(`otp:slug:${ctx.params.slug}`, { windowMs: 60_000, max: 60 });
  if (!slugGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: slugGate.retryAfterMs },
      { status: 429 }
    );
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const phone = normalizePhone(parsed.phone);
  if (!phone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });

  const result = await issueOtp(phone);
  if (!result.ok) {
    return NextResponse.json({ error: "OTP_NOT_SENT", detail: result.reason }, { status: 429 });
  }

  return NextResponse.json({ sent: true, mocked: result.mocked ?? false });
}
