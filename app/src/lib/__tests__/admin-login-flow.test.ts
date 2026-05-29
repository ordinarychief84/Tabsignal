/**
 * Integration tests for POST /api/admin/login (the super-admin console
 * sign-in). admin-auth.test.ts covers the crypto/JWT helpers in
 * isolation; this file drives the actual route handler.
 *
 * Covers:
 *   - 400 INVALID_BODY (malformed email, over-length password)
 *   - 401 INVALID_CREDENTIALS collapses every failure reason
 *     (unknown email, wrong password, no password set, suspended) so
 *     attackers can't enumerate which platform admins exist
 *   - 200 happy path: mints the admin session cookie + stamps lastSeenAt
 *   - 429 RATE_LIMITED at the per-email gate
 *
 * We mock the WHOLE @/lib/auth/admin-auth boundary (faithfully — real
 * bcrypt cost 12, real JWT signing) rather than the real module + a
 * @/lib/db mock. Why: admin-auth.test.ts statically imports
 * ../auth/admin-auth, so the real module (and its `import { db }`
 * binding) is captured by Bun BEFORE this file's beforeEach runs; a later
 * mock.module("@/lib/db") does NOT update that already-captured binding,
 * so the real loginWithPassword would hit a real (absent) DB and every
 * happy-path login would 401. Mocking the lib boundary side-steps that.
 * This mirrors admin-change-password-flow.test.ts. mock.module is
 * process-wide in Bun, so each factory reads the outer `state` lazily and
 * we reset it per test; the mock stays faithful so it can't corrupt
 * admin-auth.test.ts if it bleeds.
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

type AdminRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  suspendedAt: Date | null;
};

type StubState = {
  adminByEmail: Map<string, AdminRow>;
  updates: Array<{ id: string; data: Record<string, unknown> }>;
  rateLimitOk: boolean;
};

const KNOWN_PASSWORD = "AdminPassword-2026!";
let state: StubState;

beforeEach(async () => {
  const hash = await bcrypt.hash(KNOWN_PASSWORD, 12);
  const row: AdminRow = {
    id: "adm_1",
    email: "admin@tab-call.com",
    passwordHash: hash,
    suspendedAt: null,
  };
  state = {
    adminByEmail: new Map([[row.email, row]]),
    updates: [],
    rateLimitOk: true,
  };

  // Mock the admin-auth lib boundary, NOT @/lib/db. (See the file header
  // for why the real module + a db mock doesn't work here.) Every export
  // of the real module is reproduced faithfully so this mock can't break
  // admin-auth.test.ts if Bun's process-wide registry bleeds it across.
  const signAdmin = (adminId: string, email: string) =>
    new SignJWT({ kind: "admin", adminId, email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${60 * 60 * 8}s`)
      .sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? ""));

  mock.module("@/lib/auth/admin-auth", () => ({
    ADMIN_SESSION_COOKIE: "tabsignal_admin_session",
    adminSessionCookieOptions: () => ({
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
      maxAge: 60 * 60 * 8,
    }),
    hashPassword: async (pw: string) => {
      if (pw.length < 12) throw new Error("password must be at least 12 characters");
      if (pw.length > 128) throw new Error("password must be at most 128 characters");
      return bcrypt.hash(pw, 12);
    },
    verifyPassword: async (pw: string, hash: string) => bcrypt.compare(pw, hash),
    getAdminSession: async () => null,
    signAdminSession: signAdmin,
    // Faithful re-implementation of the real loginWithPassword: same
    // normalize → timing-safe miss → suspended → no-password → bcrypt
    // compare → sign + stamp lastSeenAt order, reading the test's rows.
    loginWithPassword: async (email: string, password: string) => {
      const normalized = email.toLowerCase().trim();
      const admin = state.adminByEmail.get(normalized);
      if (!admin) {
        await bcrypt.compare(password, "$2a$12$abcdefghijklmnopqrstuv1234567890abcdefghijklmno");
        return { ok: false as const, reason: "invalid" as const };
      }
      if (admin.suspendedAt) return { ok: false as const, reason: "suspended" as const };
      if (!admin.passwordHash) return { ok: false as const, reason: "no_password" as const };
      const match = await bcrypt.compare(password, admin.passwordHash);
      if (!match) return { ok: false as const, reason: "invalid" as const };
      const token = await signAdmin(admin.id, admin.email);
      state.updates.push({ id: admin.id, data: { lastSeenAt: new Date() } });
      return { ok: true as const, adminId: admin.id, email: admin.email, token };
    },
  }));

  // Fail-open limiter by default; flip state.rateLimitOk to force 429.
  mock.module("@/lib/rate-limit", () => ({
    rateLimit: () =>
      state.rateLimitOk ? { ok: true as const, retryAfterMs: 0 } : { ok: false as const, retryAfterMs: 3_600_000 },
    rateLimitAsync: async () =>
      state.rateLimitOk ? { ok: true as const } : { ok: false as const, retryAfterMs: 3_600_000 },
  }));
});

function makeReq(body: unknown): Request {
  return new Request("https://tab-call.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/login", () => {
  test("400 INVALID_BODY for malformed email", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "not-an-email", password: KNOWN_PASSWORD }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_BODY");
  });

  test("400 INVALID_BODY for over-length password (>128)", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "admin@tab-call.com", password: "x".repeat(129) }));
    expect(res.status).toBe(400);
  });

  test("401 INVALID_CREDENTIALS for unknown email", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "nobody@tab-call.com", password: KNOWN_PASSWORD }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_CREDENTIALS");
  });

  test("401 INVALID_CREDENTIALS for wrong password", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "admin@tab-call.com", password: "WrongPassword-2026" }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_CREDENTIALS");
  });

  test("401 INVALID_CREDENTIALS when the admin has no password set", async () => {
    const row = state.adminByEmail.get("admin@tab-call.com")!;
    row.passwordHash = null;
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "admin@tab-call.com", password: KNOWN_PASSWORD }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    // Reason "no_password" is intentionally collapsed to the generic error.
    expect(body.error).toBe("INVALID_CREDENTIALS");
  });

  test("401 INVALID_CREDENTIALS for a suspended admin (no enumeration)", async () => {
    const row = state.adminByEmail.get("admin@tab-call.com")!;
    row.suspendedAt = new Date();
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "admin@tab-call.com", password: KNOWN_PASSWORD }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_CREDENTIALS");
    // A suspended admin must NOT get a session cookie.
    expect(res.headers.get("set-cookie") ?? "").not.toContain("tabsignal_admin_session=");
  });

  test("happy path: mints admin session cookie + stamps lastSeenAt", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "admin@tab-call.com", password: KNOWN_PASSWORD }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; email: string };
    expect(body.ok).toBe(true);
    expect(body.email).toBe("admin@tab-call.com");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tabsignal_admin_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");

    expect(
      state.updates.some(u => u.id === "adm_1" && (u.data.lastSeenAt as Date) instanceof Date),
    ).toBe(true);
  });

  test("email is case-normalized: mixed-case still authenticates", async () => {
    // The route lowercases the email before lookup, so a mixed-case
    // submission matches the stored lowercase row. (Surrounding
    // whitespace, by contrast, is rejected by Zod's .email() before the
    // route gets a chance to trim — not asserted here.)
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "Admin@Tab-Call.com", password: KNOWN_PASSWORD }));
    expect(res.status).toBe(200);
  });

  test("429 RATE_LIMITED when the limiter denies", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(makeReq({ email: "admin@tab-call.com", password: KNOWN_PASSWORD }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfterMs: number };
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });
});
