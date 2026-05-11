/**
 * POST /api/auth/sign-out-everywhere
 *
 * Phase-1: clears the caller's session cookie on this device and emits
 * an audit row. Other devices' JWTs stay valid until their 30-day TTL
 * (acceptable for v1 — manager can rotate NEXTAUTH_SECRET to invalidate
 * all live sessions if compromised).
 *
 * Phase-2 will add `StaffMember.sessionsValidAfter` so this endpoint
 * actually invalidates other devices server-side. Schema column is the
 * blocker; flagged as a follow-up.
 */

import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getStaffSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export async function POST() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  void audit({
    venueId: session.venueId,
    actor: session,
    action: "staff.sign_out_everywhere",
    targetType: "StaffMember",
    targetId: session.staffId,
    metadata: { email: session.email, note: "Phase-1: only clears local cookie." },
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
