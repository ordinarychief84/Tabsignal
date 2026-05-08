import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { verifyOtp } from "@/lib/sms-otp";
import { normalizePhone } from "@/lib/sms";
import { signProfileToken, profileCookieOptions, PROFILE_COOKIE } from "@/lib/profile-cookie";

const Body = z.object({
  phone: z.string().min(7).max(40),
  code: z.string().regex(/^\d{6}$/),
  displayName: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const phone = normalizePhone(parsed.phone);
  if (!phone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });

  const verify = await verifyOtp(phone, parsed.code);
  if (!verify.ok) {
    return NextResponse.json({ error: "VERIFY_FAILED", detail: verify.reason }, { status: 401 });
  }

  // Upsert the profile. New profiles get the supplied displayName; existing
  // ones keep what's there unless the caller explicitly updates via a future
  // settings endpoint.
  const profile = await db.guestProfile.upsert({
    where: { phone },
    create: {
      phone,
      displayName: parsed.displayName ?? null,
    },
    update: {},
    select: { id: true, phone: true, displayName: true },
  });

  const token = await signProfileToken({ profileId: profile.id, phone: profile.phone });
  const res = NextResponse.json({
    profileId: profile.id,
    displayName: profile.displayName,
  });
  res.cookies.set(PROFILE_COOKIE, token, profileCookieOptions(90));
  return res;
}
