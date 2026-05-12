import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";

/**
 * Stores or clears the calling staff member's FCM token. The token is
 * minted in the browser by `getToken()` after the user grants
 * notification permission; we persist it so /api/requests can push to
 * backgrounded PWAs.
 *
 * - POST { token } → save
 * - DELETE          → clear (called on sign-out and explicit opt-out)
 *
 * Schema today: `StaffMember.fcmToken` is a single nullable string —
 * one device per staff member. If we add multi-device support later
 * we'll migrate to a child table; the route shape stays compatible.
 */

const Body = z.object({
  // FCM web tokens are ~150 chars; min 32 catches obvious junk, max
  // 2048 caps payload size so an attacker can't stuff KB of data.
  token: z.string().min(32).max(2048),
});

export async function POST(req: Request) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (_e) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  await db.staffMember.update({
    where: { id: session.staffId },
    data: { fcmToken: parsed.token },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await db.staffMember.update({
    where: { id: session.staffId },
    data: { fcmToken: null },
  });

  return NextResponse.json({ ok: true });
}
