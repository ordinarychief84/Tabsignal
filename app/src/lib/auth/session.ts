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

export function sessionCookieOptions(maxAgeDays = 30) {
  return {
    httpOnly: true,
    // Strict (was lax): the staff PWA is same-origin, so top-level
    // navigations from external sites never need to carry credentials.
    // Strict closes the residual CSRF surface that Lax leaves open on
    // top-level form POSTs and some WebView edge cases. The /api/auth/
    // callback is GET-only and lands on the same origin from the email
    // link, so Strict doesn't interfere with magic-link sign-in.
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * maxAgeDays,
  };
}
