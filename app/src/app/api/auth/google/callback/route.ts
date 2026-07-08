import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";
import { originFromRequest, safeNext } from "@/lib/auth/redirect";
import {
  verifyOauthState,
  signOauthPending,
  googleRedirectUri,
  readCookie,
  OAUTH_STATE_COOKIE,
  OAUTH_PENDING_COOKIE,
  shortLivedCookieOptions,
  clearedCookieOptions,
} from "@/lib/auth/oauth-google";
import { exchangeCode, verifyGoogleIdToken } from "@/lib/auth/oauth-google-remote";

/**
 * GET /api/auth/google/callback — Google redirects here with ?code&state.
 *
 * Verifies the CSRF state cookie, exchanges the code, verifies the
 * id_token (incl. our nonce), then resolves identity:
 *   a) known AuthIdentity → sign in
 *   b) unknown identity but email matches a staff row → auto-link (safe
 *      because Google asserts email_verified) → sign in
 *   c) unknown email → hand off to /signup with a pending cookie
 *
 * Session minting + the HTML interstitial redirect are IDENTICAL to the
 * magic-link callback (same SameSite/ITP defense), reused not rebuilt.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originFromRequest(req);
  const fail = (err: string) => NextResponse.redirect(`${origin}/login?err=${err}`);

  // 1. CSRF: the echoed state param must match the signed state cookie.
  const stateCookie = readCookie(req, OAUTH_STATE_COOKIE);
  const stateClaims = stateCookie ? await verifyOauthState(stateCookie) : null;
  const stateParam = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateClaims || !stateParam || stateParam !== stateClaims.state || !code) {
    const res = fail("oauth_state");
    res.cookies.set(OAUTH_STATE_COOKIE, "", clearedCookieOptions());
    return res;
  }

  // 2. Code → id_token → verified identity (network seam, mocked in tests).
  let identity;
  try {
    const { idToken } = await exchangeCode({
      code,
      redirectUri: googleRedirectUri(origin),
      verifier: stateClaims.verifier,
    });
    identity = await verifyGoogleIdToken(idToken, stateClaims.nonce);
  } catch (err) {
    console.error("[oauth/google] exchange/verify failed", err);
    identity = null;
  }
  if (!identity) {
    const res = fail("oauth_failed");
    res.cookies.set(OAUTH_STATE_COOKIE, "", clearedCookieOptions());
    return res;
  }
  if (!identity.emailVerified) {
    const res = fail("oauth_unverified");
    res.cookies.set(OAUTH_STATE_COOKIE, "", clearedCookieOptions());
    return res;
  }

  const email = identity.email.toLowerCase();

  // 3. Identity resolution. Prefer the provider-subject link; fall back
  //    to email match for the first-ever Google sign-in on an existing
  //    account.
  const linked = await db.authIdentity.findUnique({
    where: { provider_subject: { provider: "google", subject: identity.sub } },
    select: { staffId: true },
  });

  let staff =
    linked
      ? await db.staffMember.findUnique({ where: { id: linked.staffId } })
      : await db.staffMember.findUnique({ where: { email } });

  // 3c. Unknown → signup handoff (identity pre-verified; venue form next).
  if (!staff) {
    const pending = await signOauthPending({ sub: identity.sub, email, name: identity.name });
    const res = NextResponse.redirect(`${origin}/signup?from=google`, { status: 302 });
    res.cookies.set(OAUTH_STATE_COOKIE, "", clearedCookieOptions());
    res.cookies.set(OAUTH_PENDING_COOKIE, pending, shortLivedCookieOptions(30 * 60));
    return res;
  }

  // Status gates mirror the magic-link callback exactly.
  if (staff.status === "SUSPENDED") {
    const res = fail("suspended");
    res.cookies.set(OAUTH_STATE_COOKIE, "", clearedCookieOptions());
    return res;
  }
  if (staff.status === "DELETED") {
    const res = fail("invalid");
    res.cookies.set(OAUTH_STATE_COOKIE, "", clearedCookieOptions());
    return res;
  }

  // 3b. Auto-link on first Google sign-in for an email-matched account.
  if (!linked) {
    await db.authIdentity
      .create({ data: { provider: "google", subject: identity.sub, staffId: staff.id, email } })
      .catch(err => console.warn("[oauth/google] identity link failed", err));
  }

  // Stamp presence + verification + INVITED→ACTIVE, same as magic-link.
  await db.staffMember
    .update({
      where: { id: staff.id },
      data: {
        lastSeenAt: new Date(),
        ...(staff.status === "INVITED" ? { status: "ACTIVE" as const } : {}),
        ...(staff.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
      },
    })
    .catch(err => console.warn("[oauth/google] lastSeenAt update failed", err));

  const session = await signSessionToken({
    kind: "session",
    staffId: staff.id,
    venueId: staff.venueId,
    email: staff.email,
    role: staff.role,
  });

  const operator = await isPlatformStaffAsync({
    kind: "session",
    staffId: staff.id,
    venueId: staff.venueId,
    email: staff.email,
    role: staff.role,
  });
  const defaultDest = operator ? "/operator" : "/staff";
  const dest = safeNext(stateClaims.next ?? url.searchParams.get("next"), defaultDest);
  const destUrl = `${origin}${dest}`;
  const safeDestJsLiteral = JSON.stringify(destUrl);

  // Same interstitial-cookie pattern as /api/auth/callback: set the
  // session cookie then navigate client-side so no SameSite/ITP policy
  // drops it on the cross-site-initiated hop back from Google.
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
  res.cookies.set(OAUTH_STATE_COOKIE, "", clearedCookieOptions());
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return res;
}
