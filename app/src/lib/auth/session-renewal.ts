/**
 * Session sliding-renewal decision — the "token refresh" in TabCall's
 * model (we hold no OAuth refresh tokens). Pure + dependency-free so it
 * lives in its OWN module: the refresh route and its tests import it
 * here rather than from session.ts, which several test files mock
 * process-wide (a skinny `mock.module("@/lib/auth/session")` would
 * otherwise hide this export on some CI file-load orders — the
 * cross-file mock-leak class the repo has been bitten by before).
 *
 *   - revoked : iat predates a "sign out everywhere" cutoff → reject
 *   - expired : older than the 30-day cookie lifetime → reject
 *   - aged    : older than the 7-day renewal threshold → reissue
 *   - fresh   : younger than the threshold → leave the cookie alone
 *
 * `iat` is JWT seconds-since-epoch; `now` is ms. Revocation is checked
 * FIRST so a freshly-minted-but-revoked token can't renew.
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
