import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySessionTokenWithIat, signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { maybeRenewSession } from "@/lib/auth/session-renewal";
import { readCookie } from "@/lib/auth/oauth-google";
import { originGuard } from "@/lib/csrf";

/**
 * POST /api/auth/session/refresh — session sliding-renewal ("token
 * refresh" in TabCall's model; we store no OAuth refresh tokens).
 *
 * Reissues a fresh 30-day session cookie when the current one is valid,
 * aging past the renewal threshold, and not revoked. No-op (200) for a
 * still-fresh session; 401 for missing/invalid/expired/revoked. Works
 * for every session identically (magic-link / password / OAuth).
 */
export async function POST(req: Request) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const token = readCookie(req, SESSION_COOKIE);
  const claims = token ? await verifySessionTokenWithIat(token) : null;
  if (!claims || typeof claims.iat !== "number") {
    return NextResponse.json({ error: "INVALID_SESSION" }, { status: 401 });
  }

  // Re-read the revocation cutoff (sign-out-everywhere) before renewing.
  const row = await db.staffMember
    .findUnique({ where: { id: claims.staffId }, select: { sessionsValidAfter: true } })
    .catch(() => null);

  const decision = maybeRenewSession(
    { iat: claims.iat },
    row?.sessionsValidAfter ?? null,
    Date.now(),
  );

  if (decision.reason === "revoked" || decision.reason === "expired") {
    return NextResponse.json({ error: "SESSION_INVALID", reason: decision.reason }, { status: 401 });
  }
  if (!decision.renew) {
    return NextResponse.json({ refreshed: false });
  }

  const fresh = await signSessionToken({
    kind: "session",
    staffId: claims.staffId,
    venueId: claims.venueId,
    email: claims.email,
    role: claims.role,
  });
  const res = NextResponse.json({ refreshed: true });
  res.cookies.set(SESSION_COOKIE, fresh, sessionCookieOptions());
  return res;
}
