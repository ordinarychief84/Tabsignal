import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWearAuth, isWearAuthFail } from "@/lib/auth/wear";

/**
 * POST /api/wear/fcm-token — register (or clear) the watch's own FCM
 * push token. Stored on the WearDevice row, NOT StaffMember.fcmToken,
 * so a watch pairing never clobbers the phone PWA's push registration.
 * New-request fan-out targets both.
 */
const Body = z.object({
  token: z.string().min(8).max(4096).nullable(),
});

export async function POST(req: Request) {
  const auth = await getWearAuth(req);
  if (isWearAuthFail(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  await db.wearDevice.update({
    where: { id: auth.deviceId },
    data: { fcmToken: parsed.token },
  });

  return NextResponse.json({ ok: true });
}
