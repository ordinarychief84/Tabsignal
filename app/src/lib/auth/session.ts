import { cookies } from "next/headers";
import { verifySessionTokenWithIat, type SessionClaims } from "./token";
import { getAdminSession } from "./admin-auth";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "tabsignal_session";

/**
 * Synthetic IDs used for platform-admin sessions. These don't match any
 * row in StaffMember or Venue — admin sessions are venue-less by design.
 * Code paths that need a real venue (e.g. /admin/v/[slug] layouts) will
 * still reject these synthetic sessions because they check venueId
 * against the requested venue's id. /operator and any global pages just
 * need a session with `isOperatorAsync(session)` to return true.
 */
const PLATFORM_ADMIN_VENUE_ID = "platform";

/**
 * Read the current staff session from the cookie. Returns null if
 * missing, invalid, or invalidated via "Sign out everywhere".
 *
 * Recognises TWO cookies:
 *   - SESSION_COOKIE (staff magic-link auth) — returned as-is
 *   - ADMIN_SESSION_COOKIE (platform-admin password auth) — returned as a
 *     synthetic SessionClaims so /operator and other email-based gates
 *     accept it. The synthetic claims use a placeholder venueId so
 *     venue-scoped layouts continue to refuse cross-venue access.
 *
 * The sessionsValidAfter check happens here (one DB read per request)
 * rather than in verifySessionToken so the JWT module stays pure /
 * server-runtime-agnostic. Rows with sessionsValidAfter=null skip the
 * comparison entirely so the existing fleet of cached JWTs keeps working
 * after the feature ships.
 */
export async function getStaffSession(): Promise<SessionClaims | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const claims = await verifySessionTokenWithIat(token);
    if (claims) {
      // Refuse JWTs minted before the user's "sign out everywhere" cutoff.
      const iat = typeof claims.iat === "number" ? claims.iat : 0;
      let revoked = false;
      if (iat > 0) {
        const row = await db.staffMember.findUnique({
          where: { id: claims.staffId },
          select: { sessionsValidAfter: true },
        }).catch(() => null);
        if (row?.sessionsValidAfter && row.sessionsValidAfter.getTime() / 1000 > iat) {
          revoked = true;
        }
      }
      if (!revoked) {
        const { staffId, venueId, email, role } = claims;
        return { kind: "session", staffId, venueId, email, role };
      }
      // Revoked staff session: don't return early. Fall through to the
      // admin cookie check below. Otherwise an operator who hit "sign
      // out everywhere" on a stale staff session would be locked out of
      // /operator even though they have a valid admin cookie.
    }
  }

  // Fall back to the admin session cookie. Platform admins use password
  // sign-in at /admin/login; the resulting cookie is separate from the
  // staff session, but every gate downstream checks getStaffSession() so
  // we synthesize a staff-shaped session here.
  const admin = await getAdminSession();
  if (admin) {
    return {
      kind: "session",
      staffId: `pa_${admin.adminId}`,
      venueId: PLATFORM_ADMIN_VENUE_ID,
      email: admin.email,
      role: "OWNER",
    };
  }

  return null;
}

/**
 * Session sliding-renewal decision (the "token refresh" in TabCall's
 * model — we hold no OAuth refresh tokens). Pure + unit-tested so the
 * refresh route stays thin. Applies identically to every session
 * regardless of how it was minted (magic-link / password / OAuth).
 *
 *   - revoked  : iat predates a "sign out everywhere" cutoff → reject
 *   - expired  : older than the 30-day cookie lifetime → reject
 *   - aged     : older than the 7-day renewal threshold → reissue
 *   - fresh    : younger than the threshold → leave the cookie alone
 *
 * `iat` is the JWT seconds-since-epoch; `now` is ms. Revocation is
 * checked FIRST so a freshly-minted-but-revoked token can't renew.
 */
const RENEW_AFTER_MS = 7 * 24 * 60 * 60_000;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export type RenewDecision = { renew: boolean; reason: "revoked" | "expired" | "aged" | "fresh" };

export function maybeRenewSession(
  claims: { iat: number },
  staffValidAfter: Date | null,
  now: number,
): RenewDecision {
  const iatMs = claims.iat * 1000;
  if (staffValidAfter && iatMs < staffValidAfter.getTime()) {
    return { renew: false, reason: "revoked" };
  }
  const ageMs = now - iatMs;
  if (ageMs > SESSION_MAX_AGE_MS) return { renew: false, reason: "expired" };
  if (ageMs > RENEW_AFTER_MS) return { renew: true, reason: "aged" };
  return { renew: false, reason: "fresh" };
}

export function sessionCookieOptions(maxAgeDays = 30) {
  return {
    httpOnly: true,
    // Lax (was strict): SameSite=Strict prevents the cookie from being
    // sent on top-level navigations whose *chain* originates cross-site
    // — including the redirect from /api/auth/callback to /admin/v/[slug]
    // after an email-link click (Gmail → callback → dashboard). The
    // callback's response sets the cookie, but the subsequent request
    // for the dashboard doesn't include it under Strict, so the layout
    // bounces the user to /staff/login. Lax allows the cookie on
    // top-level GET navigations (which is exactly what an email click
    // is) while still blocking cross-site POST/PUT/DELETE — the CSRF
    // surface that actually matters. This is the standard SameSite
    // posture for session cookies; Strict was wrong here.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * maxAgeDays,
  };
}
