import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyLinkToken, signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/staff/login?err=missing", url.origin));
  }
  const claims = await verifyLinkToken(token);
  if (!claims) {
    return NextResponse.redirect(new URL("/staff/login?err=expired", url.origin));
  }

  const staff = await db.staffMember.findUnique({ where: { id: claims.staffId } });
  if (!staff || staff.email.toLowerCase() !== claims.email.toLowerCase()) {
    return NextResponse.redirect(new URL("/staff/login?err=invalid", url.origin));
  }

  const session = await signSessionToken({
    kind: "session",
    staffId: staff.id,
    venueId: staff.venueId,
    email: staff.email,
    role: staff.role,
  });

  const res = NextResponse.redirect(new URL("/staff", url.origin));
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return res;
}
