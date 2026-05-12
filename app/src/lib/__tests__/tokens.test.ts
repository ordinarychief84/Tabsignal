/**
 * Token-lifecycle tests for the magic-link + session JWTs. Exercises the
 * sign/verify round-trip and the parts of /api/auth/callback's logic that
 * don't need a database (kind discrimination, jti integrity, claim
 * tamper resistance).
 *
 * The full single-use replay test (jti uniqueness on LinkTokenUse) needs
 * Postgres and lives in `integration/` — this file covers the JWT layer.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  signLinkToken,
  verifyLinkToken,
  signSessionToken,
  verifySessionToken,
  verifySessionTokenWithIat,
} from "../auth/token";

// Need a secret long enough for HS256.
const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

describe("magic-link tokens", () => {
  test("round-trips and exposes jti", async () => {
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "owner@example.com",
    });
    const claims = await verifyLinkToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.staffId).toBe("stf_1");
    expect(claims!.email).toBe("owner@example.com");
    expect(typeof claims!.jti).toBe("string");
    expect(claims!.jti.length).toBeGreaterThan(8);
  });

  test("explicit jti is preserved (so the DB single-use guard can match)", async () => {
    const jti = "jti-fixed-12345";
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_x",
      email: "a@b.test",
      jti,
    });
    const claims = await verifyLinkToken(token);
    expect(claims?.jti).toBe(jti);
  });

  test("session token is rejected by link verifier (kind discrimination)", async () => {
    const session = await signSessionToken({
      kind: "session",
      staffId: "s1",
      venueId: "v1",
      email: "x@y",
      role: "OWNER",
    });
    expect(await verifyLinkToken(session)).toBeNull();
  });

  test("tampered token signature fails verification", async () => {
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "owner@example.com",
    });
    // Flip a character in the signature segment.
    const parts = token.split(".");
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === "A" ? "B" : "A");
    const tampered = parts.join(".");
    expect(await verifyLinkToken(tampered)).toBeNull();
  });
});

describe("session tokens", () => {
  test("round-trips with role + venue claims", async () => {
    const token = await signSessionToken({
      kind: "session",
      staffId: "stf_x",
      venueId: "ven_y",
      email: "owner@example.com",
      role: "MANAGER",
    });
    const claims = await verifySessionToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.role).toBe("MANAGER");
    expect(claims!.venueId).toBe("ven_y");
  });

  test("verifySessionTokenWithIat exposes iat for sessionsValidAfter check", async () => {
    const token = await signSessionToken({
      kind: "session",
      staffId: "stf_x",
      venueId: "ven_y",
      email: "owner@example.com",
      role: "OWNER",
    });
    const claims = await verifySessionTokenWithIat(token);
    expect(claims).not.toBeNull();
    expect(typeof claims!.iat).toBe("number");
    // Issued at must be within the last 5 seconds.
    const now = Math.floor(Date.now() / 1000);
    expect(claims!.iat!).toBeGreaterThan(now - 5);
    expect(claims!.iat!).toBeLessThanOrEqual(now);
  });

  test("garbage input returns null instead of throwing", async () => {
    expect(await verifySessionToken("not.a.token")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});
