import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyLinkToken, signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

/**
 * Resolve the public origin from the request — Next.js binds to 0.0.0.0 in
 * dev, so `req.url` reports `http://0.0.0.0:3000` and any redirect built
 * from it would be unreachable from a phone. The Host header carries
 * whatever URL the client actually used.
 */
function originFromRequest(req: Request): string {
  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host");
  const host = fwdHost ?? req.headers.get("host");
  if (host) {
    const proto = fwdProto ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.APP_URL ?? "http://localhost:3000";
}

/**
 * Only allow same-origin path redirects from the `next` param. Reject
 * absolute URLs and protocol-relative URLs to prevent open-redirect.
 */
function safeNext(next: string | null | undefined): string {
  if (!next) return "/staff";
  if (!next.startsWith("/")) return "/staff";
  if (next.startsWith("//")) return "/staff";
  return next;
}

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

  const dest = safeNext(claims.next ?? url.searchParams.get("next"));
  const res = NextResponse.redirect(`${origin}${dest}`);
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return res;
}
