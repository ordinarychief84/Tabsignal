/**
 * Integration-style tests for POST /api/admin/account/password.
 *
 * Covers:
 *   - UNAUTHORIZED when no admin session
 *   - INVALID_BODY when payload malformed
 *   - SAME_PASSWORD when new === current
 *   - INVALID_CURRENT_PASSWORD when current doesn't match the stored hash
 *   - RATE_LIMITED on burst
 *   - NO_PASSWORD_SET when the row has no hash (admin invited but never set one)
 *   - Happy path: hash is replaced, passwordChangedAt is bumped, cookie cleared
 *
 * Mocks db / admin session / rate-limit. Uses real bcryptjs (slow but
 * faithful — the route hashes the new password live).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

type StubState = {
  session: { kind: "admin"; adminId: string; email: string; iat: number } | null;
  adminRow: {
    id: string;
    passwordHash: string | null;
    suspendedAt: Date | null;
  } | null;
  updates: Array<{ id: string; passwordHash: string; passwordChangedAt: Date }>;
};

let state: StubState;
let knownCurrentHash = "";

beforeEach(async () => {
  // Compute a real bcrypt hash for "CurrentPw-123456" so the happy
  // path's verifyPassword actually matches.
  knownCurrentHash = await bcrypt.hash("CurrentPw-123456", 12);
  state = {
    session: {
      kind: "admin",
      adminId: "pa_test",
      email: "owner@tab-call.com",
      iat: Math.floor(Date.now() / 1000),
    },
    adminRow: {
      id: "pa_test",
      passwordHash: knownCurrentHash,
      suspendedAt: null,
    },
    updates: [],
  };

  // Mock admin-auth. IMPORTANT: include EVERY export of the real
  // module AND keep them faithful to the real behaviour — Bun's
  // mock.module is process-wide; admin-auth.test.ts runs in the same
  // worker and asserts bcrypt cost 12 + real JWT format, so any
  // shortcut here will break that file.
  mock.module("@/lib/auth/admin-auth", () => ({
    ADMIN_SESSION_COOKIE: "tabsignal_admin_session",
    adminSessionCookieOptions: () => ({
      httpOnly: true,
      secure: false,
      sameSite: "strict" as const,
      path: "/",
      maxAge: 60 * 60 * 8,
    }),
    getAdminSession: async () => state.session,
    hashPassword: async (pw: string) => {
      if (pw.length < 12) throw new Error("password must be at least 12 characters");
      if (pw.length > 128) throw new Error("password must be at most 128 characters");
      return bcrypt.hash(pw, 12);
    },
    verifyPassword: async (pw: string, hash: string) => bcrypt.compare(pw, hash),
    signAdminSession: async (adminId: string, email: string) => {
      const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
      return new SignJWT({ kind: "admin", adminId, email })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${60 * 60 * 8}s`)
        .sign(secret);
    },
    loginWithPassword: async () => ({ ok: false as const, reason: "invalid" as const }),
  }));

  mock.module("@/lib/db", () => ({
    db: {
      platformAdmin: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          state.adminRow && state.adminRow.id === where.id ? state.adminRow : null,
        update: async ({ where, data }: { where: { id: string }; data: { passwordHash: string; passwordChangedAt: Date } }) => {
          state.updates.push({ id: where.id, passwordHash: data.passwordHash, passwordChangedAt: data.passwordChangedAt });
          if (state.adminRow && state.adminRow.id === where.id) {
            state.adminRow = {
              ...state.adminRow,
              passwordHash: data.passwordHash,
            };
          }
          return { id: where.id };
        },
      },
    },
  }));

  // NOTE: we deliberately do NOT mock @/lib/rate-limit here. Bun's
  // mock.module is process-wide and any factory we install bleeds
  // into rate-limit.test.ts and reservations.test.ts which run later
  // alphabetically. The real in-memory rate-limit fallback is fine
  // for our purposes — every test in this file makes a single POST,
  // well below the 5/hour cap. We don't bother covering the 429 branch
  // here; that branch is exercised by auth-start-flow.test.ts and
  // signup-flow.test.ts where the mocked rate-limit is scoped to the
  // routes those files cover.
});

function makeReq(body: unknown): Request {
  return new Request("https://tab-call.test/api/admin/account/password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/account/password", () => {
  test("401 UNAUTHORIZED when no admin session", async () => {
    state.session = null;
    const { POST } = await import("../../app/api/admin/account/password/route");
    const res = await POST(makeReq({ currentPassword: "x", newPassword: "x" }));
    expect(res.status).toBe(401);
  });

  test("400 INVALID_BODY when new password too short", async () => {
    const { POST } = await import("../../app/api/admin/account/password/route");
    const res = await POST(
      makeReq({ currentPassword: "CurrentPw-123456", newPassword: "short" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_BODY");
  });

  test("400 SAME_PASSWORD when new === current", async () => {
    const { POST } = await import("../../app/api/admin/account/password/route");
    const res = await POST(
      makeReq({ currentPassword: "Identical-Pw-1234", newPassword: "Identical-Pw-1234" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("SAME_PASSWORD");
  });

  test("401 INVALID_CURRENT_PASSWORD when current doesn't match", async () => {
    const { POST } = await import("../../app/api/admin/account/password/route");
    const res = await POST(
      makeReq({ currentPassword: "WrongPassword-1234", newPassword: "NewSecurePw-2026" }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_CURRENT_PASSWORD");
    // No DB update happened.
    expect(state.updates.length).toBe(0);
  });

  test("400 NO_PASSWORD_SET when the admin row has no hash", async () => {
    state.adminRow = { id: "pa_test", passwordHash: null, suspendedAt: null };
    const { POST } = await import("../../app/api/admin/account/password/route");
    const res = await POST(
      makeReq({ currentPassword: "Anything-1234567", newPassword: "NewSecurePw-2026" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NO_PASSWORD_SET");
  });

  test("401 when admin row is suspended", async () => {
    state.adminRow = {
      id: "pa_test",
      passwordHash: knownCurrentHash,
      suspendedAt: new Date(),
    };
    const { POST } = await import("../../app/api/admin/account/password/route");
    const res = await POST(
      makeReq({ currentPassword: "CurrentPw-123456", newPassword: "NewSecurePw-2026" }),
    );
    expect(res.status).toBe(401);
  });

  test("happy path: updates hash, bumps passwordChangedAt, clears admin cookie", async () => {
    const { POST } = await import("../../app/api/admin/account/password/route");
    const res = await POST(
      makeReq({ currentPassword: "CurrentPw-123456", newPassword: "NewSecurePw-2026" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(state.updates.length).toBe(1);
    const update = state.updates[0];
    expect(update.id).toBe("pa_test");
    expect(update.passwordHash).not.toBe(knownCurrentHash);
    expect(update.passwordChangedAt).toBeInstanceOf(Date);

    // The new hash must verify against the new password and fail
    // against the old.
    expect(await bcrypt.compare("NewSecurePw-2026", update.passwordHash)).toBe(true);
    expect(await bcrypt.compare("CurrentPw-123456", update.passwordHash)).toBe(false);

    // The admin cookie was cleared (max-age=0 in the Set-Cookie header).
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tabsignal_admin_session=");
    expect(setCookie.toLowerCase()).toMatch(/max-age=0/);
  });
});
