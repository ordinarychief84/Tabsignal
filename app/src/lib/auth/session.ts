import { cookies } from "next/headers";
import { verifySessionTokenWithIat, type SessionClaims } from "./token";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "tabsignal_session";

/**
 * Read the current staff session from the cookie. Returns null if
 * missing, invalid, or invalidated via "Sign out everywhere".
 *
 * The sessionsValidAfter check happens here (one DB read per request)
 * rather than in verifySessionToken so the JWT module stays pure /
 * server-runtime-agnostic. Rows with sessionsValidAfter=null skip the
 * comparison entirely so the existing fleet of cached JWTs keeps working
 * after the feature ships.
 */
export async function getStaffSession(): Promise<SessionClaims | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionTokenWithIat(token);
  if (!claims) return null;

  // Refuse JWTs minted before the user's "sign out everywhere" cutoff.
  // iat is in seconds; sessionsValidAfter is a ms-precision Date.
  const iat = typeof claims.iat === "number" ? claims.iat : 0;
  if (iat > 0) {
    const row = await db.staffMember.findUnique({
      where: { id: claims.staffId },
      select: { sessionsValidAfter: true },
    }).catch(() => null);
    if (row?.sessionsValidAfter && row.sessionsValidAfter.getTime() / 1000 > iat) {
      return null;
    }
  }
  // Strip the JWT-claim fields we don't expose on SessionClaims.
  const { staffId, venueId, email, role } = claims;
  return { kind: "session", staffId, venueId, email, role };
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
