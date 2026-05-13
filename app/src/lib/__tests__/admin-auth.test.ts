/**
 * Tests for the super-admin password auth helpers in lib/auth/admin-auth.ts.
 *
 * Covers:
 *   - hashPassword / verifyPassword round-trip + length validation
 *   - signAdminSession produces a verifiable JWT and the iat is stamped
 *
 * The /api/admin/login route is tested separately in
 * admin-login-flow.test.ts via mock.module + dynamic import.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { jwtVerify } from "jose";
import {
  hashPassword,
  signAdminSession,
  verifyPassword,
} from "../auth/admin-auth";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

describe("hashPassword / verifyPassword", () => {
  test("round-trips a strong password", async () => {
    const pw = "TabCall-Strong-Pw-2026";
    const hash = await hashPassword(pw);
    expect(hash).toMatch(/^\$2[aby]\$12\$/); // bcrypt prefix + work factor 12
    expect(await verifyPassword(pw, hash)).toBe(true);
    expect(await verifyPassword("wrong-password-2026", hash)).toBe(false);
  });

  test("rejects passwords shorter than 12 chars", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 12/);
  });

  test("rejects passwords longer than 128 chars", async () => {
    await expect(hashPassword("a".repeat(129))).rejects.toThrow(/at most 128/);
  });

  test("hash is randomized — same password produces different hashes", async () => {
    const pw = "TabCall-Strong-Pw-2026";
    const a = await hashPassword(pw);
    const b = await hashPassword(pw);
    expect(a).not.toBe(b);
    // Both still verify
    expect(await verifyPassword(pw, a)).toBe(true);
    expect(await verifyPassword(pw, b)).toBe(true);
  });
});

describe("signAdminSession", () => {
  test("mints a verifiable JWT with kind=admin claim", async () => {
    const token = await signAdminSession("pa_test", "ops@tab-call.com");
    const secret = new TextEncoder().encode(
      "test-secret-must-be-at-least-32-characters-long-for-zod",
    );
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    expect(payload.kind).toBe("admin");
    expect(payload.adminId).toBe("pa_test");
    expect(payload.email).toBe("ops@tab-call.com");
    expect(typeof payload.iat).toBe("number");
    // exp must be ~8 hours from now (TTL)
    expect(typeof payload.exp).toBe("number");
    const nowSec = Math.floor(Date.now() / 1000);
    expect((payload.exp as number) - nowSec).toBeGreaterThan(60 * 60 * 7); // > 7h remaining
    expect((payload.exp as number) - nowSec).toBeLessThanOrEqual(60 * 60 * 8 + 5); // <= 8h + slack
  });
});
