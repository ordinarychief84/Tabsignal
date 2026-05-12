/**
 * Sign-out-everywhere round-trip semantics: a JWT minted before the
 * staff member's `sessionsValidAfter` timestamp must be rejected, and
 * a JWT minted after must pass.
 *
 * This tests the comparison logic only (JWT iat vs DB timestamp).
 * The actual DB read in `getStaffSession` is integration territory.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { signSessionToken, verifySessionTokenWithIat } from "../auth/token";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

/**
 * Mirrors the comparison in `lib/auth/session.ts:getStaffSession()`:
 *   row.sessionsValidAfter.getTime() / 1000 > iat → reject
 */
function shouldReject(iatSec: number, sessionsValidAfter: Date | null): boolean {
  if (!sessionsValidAfter) return false;
  return sessionsValidAfter.getTime() / 1000 > iatSec;
}

describe("sessionsValidAfter comparison", () => {
  test("null cutoff: no rejection (existing JWTs survive the feature ship)", async () => {
    const token = await signSessionToken({
      kind: "session",
      staffId: "s1",
      venueId: "v1",
      email: "x@y",
      role: "OWNER",
    });
    const claims = await verifySessionTokenWithIat(token);
    expect(claims).not.toBeNull();
    expect(shouldReject(claims!.iat!, null)).toBe(false);
  });

  test("cutoff in the future relative to iat: reject", async () => {
    const token = await signSessionToken({
      kind: "session",
      staffId: "s1",
      venueId: "v1",
      email: "x@y",
      role: "OWNER",
    });
    const claims = await verifySessionTokenWithIat(token);
    const future = new Date((claims!.iat! + 60) * 1000);
    expect(shouldReject(claims!.iat!, future)).toBe(true);
  });

  test("cutoff in the past relative to iat: do not reject (fresh JWTs pass)", async () => {
    const token = await signSessionToken({
      kind: "session",
      staffId: "s1",
      venueId: "v1",
      email: "x@y",
      role: "OWNER",
    });
    const claims = await verifySessionTokenWithIat(token);
    const past = new Date((claims!.iat! - 60) * 1000);
    expect(shouldReject(claims!.iat!, past)).toBe(false);
  });

  test("equal-to-iat cutoff: does not reject (boundary is strict >)", async () => {
    const token = await signSessionToken({
      kind: "session",
      staffId: "s1",
      venueId: "v1",
      email: "x@y",
      role: "OWNER",
    });
    const claims = await verifySessionTokenWithIat(token);
    const exact = new Date(claims!.iat! * 1000);
    expect(shouldReject(claims!.iat!, exact)).toBe(false);
  });
});
