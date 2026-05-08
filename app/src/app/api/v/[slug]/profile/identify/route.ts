import { NextResponse } from "next/server";
import { z } from "zod";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { issueOtp } from "@/lib/sms-otp";
import { normalizePhone } from "@/lib/sms";

const Body = z.object({ phone: z.string().min(7).max(40) });

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

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
