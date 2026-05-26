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
  // Soft-deleted (resigned/fired) staff: refuse the link entirely. They
  // get the same "invalid" error a never-existed account would —
  // doesn't leak that the venue once knew them.
  if (staff.status === "DELETED") {
    return NextResponse.redirect(`${origin}/staff/login?err=invalid`);
  }
  await db.staffMember
    .update({
      where: { id: staff.id },
      data: {
        lastSeenAt: new Date(),
        // Promote INVITED → ACTIVE on first successful sign-in.
        ...(staff.status === "INVITED" ? { status: "ACTIVE" as const } : {}),
        // Stamp email verification the first time a user clicks their
        // magic link. The password-sign-in path refuses to mint a
        // session until this is set, so this is what flips a brand-
        // new password-only account into "can use password to sign in".
        ...(staff.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
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

  // Belt-and-braces against SameSite-Strict / ITP / older WebView
  // quirks: instead of issuing an HTTP redirect (whose response carries
  // Set-Cookie but whose subsequent request can be tagged with the
  // cross-site initiator from the email-link click), we return a tiny
  // HTML page that sets the session cookie THEN navigates client-side
  // via window.location.replace(). The follow-up navigation is
  // initiated by the page itself, so the browser treats it as a same-
  // site request and includes the just-set cookie even under the
  // strictest SameSite policies. Visible UX: a sub-second flash of
  // "Signing you in…" before the dashboard renders.
  const destUrl = `${origin}${dest}`;
  // safeNext already restricted `dest` to paths beginning with `/` and
  // rejected protocol-relative / javascript: / data: schemes — JSON-
  // stringifying defends against any residual encoding surprise when
  // we embed the URL inside a <script> string literal.
  const safeDestJsLiteral = JSON.stringify(destUrl);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing you in…</title>
    <meta http-equiv="refresh" content="0;url=${destUrl}" />
    <style>
      body { font: 14px system-ui, sans-serif; color: #2A2837;
             background: #F7F5F2; margin: 0; min-height: 100vh;
             display: flex; align-items: center; justify-content: center; }
      .card { padding: 1.25rem 1.5rem; border-radius: 12px;
              background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    </style>
  </head>
  <body>
    <div class="card">Signing you in…</div>
    <script>window.location.replace(${safeDestJsLiteral});</script>
  </body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return res;
}
