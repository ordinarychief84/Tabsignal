import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyLinkToken, signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";
import { originFromRequest, safeNext } from "@/lib/auth/redirect";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originFromRequest(req);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${origin}/staff/login?err=missing`);
  }
  const claims = await verifyLinkToken(token);
  if (!claims) {
    return NextResponse.redirect(`${origin}/staff/login?err=expired`);
  }

  // Validate the staff record FIRST. If we burned the jti before this
  // check and the staff was missing or email mismatched, the legitimate
  // user's link would be permanently dead — and an attacker who fired
  // the link with garbage state would lock the victim out. Look up
  // first, then consume the jti atomically as a single-use guard.
  const staff = await db.staffMember.findUnique({ where: { id: claims.staffId } });
  if (!staff || staff.email.toLowerCase() !== claims.email.toLowerCase()) {
    return NextResponse.redirect(`${origin}/staff/login?err=invalid`);
  }

  // Single-use enforcement: consume the jti atomically. If the row already
  // exists, this attempt is a replay (forwarded email, browser preview,
  // password manager prefetch) — refuse.
  try {
    await db.linkTokenUse.create({
      data: { jti: claims.jti, staffId: claims.staffId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.redirect(`${origin}/staff/login?err=already_used`);
    }
    throw err;
  }

  // Phase-1 RBAC: any successful sign-in flips the row out of INVITED
  // and stamps lastSeenAt. SUSPENDED rows are refused so a fired
  // bartender can't reuse the link they got six months ago. Failures
  // here only affect observability — never block the login.
  if (staff.status === "SUSPENDED") {
    return NextResponse.redirect(`${origin}/staff/login?err=suspended`);
  }
  await db.staffMember
    .update({
      where: { id: staff.id },
      data: {
        lastSeenAt: new Date(),
        // Promote INVITED → ACTIVE on first successful sign-in.
        ...(staff.status === "INVITED" ? { status: "ACTIVE" as const } : {}),
      },
    })
    .catch(err => console.warn("[auth/callback] lastSeenAt update failed", err));

  const session = await signSessionToken({
    kind: "session",
    staffId: staff.id,
    venueId: staff.venueId,
    email: staff.email,
    role: staff.role,
  });

  // Operators landing without a next= go to /operator (they almost
  // always want the platform console). Everyone else gets /staff.
  const operator = await isPlatformStaffAsync({
    kind: "session",
    staffId: staff.id,
    venueId: staff.venueId,
    email: staff.email,
    role: staff.role,
  });
  const defaultDest = operator ? "/operator" : "/staff";
  const dest = safeNext(claims.next ?? url.searchParams.get("next"), defaultDest);
  const res = NextResponse.redirect(`${origin}${dest}`);
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return res;
}
