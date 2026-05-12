/**
 * POST /api/auth/sign-out-everywhere
 *
 * Invalidates every active session for the caller's StaffMember by
 * bumping `sessionsValidAfter` to NOW(). lib/auth/session.ts checks the
 * JWT's iat against this column on every request and rejects older
 * tokens. Clears the local cookie too so the caller is signed out on
 * this device immediately. Logs to the venue audit trail.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getStaffSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { originGuard } from "@/lib/csrf";

export async function POST(req: Request) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Bump the per-staff cutoff. Any cached JWT issued before this moment
  // will fail the iat check on its next use.
  const now = new Date();
  await db.staffMember.update({
    where: { id: session.staffId },
    data: { sessionsValidAfter: now },
  });

  void audit({
    venueId: session.venueId,
    actor: session,
    action: "staff.sign_out_everywhere",
    targetType: "StaffMember",
    targetId: session.staffId,
    metadata: { email: session.email, validAfter: now.toISOString() },
  });

  const res = NextResponse.json({ ok: true, validAfter: now.toISOString() });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
