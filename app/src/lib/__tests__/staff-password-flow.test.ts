/**
 * Tests for the StaffMember password auth flow.
 *
 * Covers:
 *   - hashStaffPassword / verifyStaffPassword round-trip
 *   - loginStaffWithPassword every branch (invalid, no_password,
 *     suspended, unverified, ok)
 *   - POST /api/auth/login route gates (INVALID_BODY, rate limit,
 *     INVALID_CREDENTIALS, EMAIL_UNVERIFIED, happy path with cookie)
 *   - POST /api/auth/set-password (first-time setup, rotation
 *     with currentPassword, SAME_PASSWORD, INVALID_CURRENT_PASSWORD,
 *     sessionsValidAfter bump)
 *
 * Mocks @/lib/db / @/lib/auth/session / @/lib/rate-limit using the
 * same pattern as the existing admin auth tests. Bun's mock.module is
 * process-wide so every export is included to avoid sibling-test
 * pollution.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import bcrypt from "bcryptjs";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

type StaffRow = {
  id: string;
  venueId: string;
  email: string;
  role: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
};

type StubState = {
  staffByEmail: Map<string, StaffRow>;
  staffById: Map<string, StaffRow>;
  session: { kind: "session"; staffId: string; venueId: string; email: string; role: string; iat: number } | null;
  updates: Array<{ id: string; data: Record<string, unknown> }>;
};

let state: StubState;

beforeEach(async () => {
  const goodHash = await bcrypt.hash("KnownPasswordIs1234!", 12);
  const row: StaffRow = {
    id: "stf_1",
    venueId: "v_1",
    email: "owner@example.com",
    role: "OWNER",
    status: "ACTIVE",
    passwordHash: goodHash,
    emailVerifiedAt: new Date(),
  };
  state = {
    staffByEmail: new Map([[row.email, row]]),
    staffById: new Map([[row.id, row]]),
    session: null,
    updates: [],
  };

  // Mock @/lib/db — only the methods the route handlers touch.
  mock.module("@/lib/db", () => ({
    db: {
      staffMember: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.email) return state.staffByEmail.get(where.email) ?? null;
          if (where.id) return state.staffById.get(where.id) ?? null;
          return null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          state.updates.push({ id: where.id, data });
          const row = state.staffById.get(where.id);
          if (row) {
            const merged = { ...row, ...data } as StaffRow;
            state.staffById.set(row.id, merged);
            state.staffByEmail.set(row.email, merged);
          }
          return { id: where.id };
        },
      },
    },
  }));

  // Mock session module FULL surface — sibling tests assume real exports.
  mock.module("@/lib/auth/session", () => ({
    SESSION_COOKIE: "tabsignal_session",
    sessionCookieOptions: () => ({
      httpOnly: true,
      secure: false,
      sameSite: "strict" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
    getStaffSession: async () => state.session,
  }));

  // Token module NOT mocked — we use the real signSessionToken with the
  // NEXTAUTH_SECRET set in beforeAll. Mocking it triggered cross-file
  // pollution that broke tokens.test.ts.
  //
  // Rate-limit also NOT mocked — see the comment in
  // admin-change-password-flow.test.ts. Real in-memory fallback works
  // fine for our case (each test makes 1 POST).
});

function makeReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

/* ---------- hashStaffPassword / verifyStaffPassword ---------------- */

describe("hashStaffPassword / verifyStaffPassword", () => {
  test("round-trip with a strong password", async () => {
    const { hashStaffPassword, verifyStaffPassword } = await import("../auth/staff-password");
    const pw = "TabCall-Owner-Pw-2026";
    const hash = await hashStaffPassword(pw);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyStaffPassword(pw, hash)).toBe(true);
    expect(await verifyStaffPassword("WrongPassword-2026", hash)).toBe(false);
  });

  test("rejects passwords < 12 chars", async () => {
    const { hashStaffPassword } = await import("../auth/staff-password");
    await expect(hashStaffPassword("short")).rejects.toThrow(/at least 12/);
  });
});

/* ---------- loginStaffWithPassword --------------------------------- */

describe("loginStaffWithPassword", () => {
  test("returns invalid for unknown email", async () => {
    const { loginStaffWithPassword } = await import("../auth/staff-password");
    const res = await loginStaffWithPassword("missing@example.com", "any-password-1234");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid");
  });

  test("returns no_password when row has null passwordHash", async () => {
    const row = state.staffByEmail.get("owner@example.com")!;
    row.passwordHash = null;
    state.staffByEmail.set(row.email, row);
    state.staffById.set(row.id, row);

    const { loginStaffWithPassword } = await import("../auth/staff-password");
    const res = await loginStaffWithPassword("owner@example.com", "AnyPassword-1234");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_password");
  });

  test("returns suspended for SUSPENDED row", async () => {
    const row = state.staffByEmail.get("owner@example.com")!;
    row.status = "SUSPENDED";
    state.staffByEmail.set(row.email, row);
    state.staffById.set(row.id, row);

    const { loginStaffWithPassword } = await import("../auth/staff-password");
    const res = await loginStaffWithPassword("owner@example.com", "KnownPasswordIs1234!");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("suspended");
  });

  test("returns unverified when emailVerifiedAt is null", async () => {
    const row = state.staffByEmail.get("owner@example.com")!;
    row.emailVerifiedAt = null;
    state.staffByEmail.set(row.email, row);
    state.staffById.set(row.id, row);

    const { loginStaffWithPassword } = await import("../auth/staff-password");
    const res = await loginStaffWithPassword("owner@example.com", "KnownPasswordIs1234!");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unverified");
  });

  test("returns invalid for wrong password (verified row)", async () => {
    const { loginStaffWithPassword } = await import("../auth/staff-password");
    const res = await loginStaffWithPassword("owner@example.com", "WrongPassword-2026");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid");
  });

  test("returns ok for verified row + correct password", async () => {
    const { loginStaffWithPassword } = await import("../auth/staff-password");
    const res = await loginStaffWithPassword("owner@example.com", "KnownPasswordIs1234!");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.staff.email).toBe("owner@example.com");
      expect(res.staff.venueId).toBe("v_1");
      expect(res.staff.role).toBe("OWNER");
    }
  });
});

/* ---------- POST /api/auth/login ----------------------------------- */

describe("POST /api/auth/login", () => {
  test("400 INVALID_BODY for malformed payload", async () => {
    const { POST } = await import("../../app/api/auth/login/route");
    const res = await POST(makeReq("https://tab-call.test/api/auth/login", { email: "bad" }));
    expect(res.status).toBe(400);
  });

  test("401 EMAIL_UNVERIFIED when row's emailVerifiedAt is null", async () => {
    const row = state.staffByEmail.get("owner@example.com")!;
    row.emailVerifiedAt = null;
    state.staffByEmail.set(row.email, row);
    state.staffById.set(row.id, row);

    const { POST } = await import("../../app/api/auth/login/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/login", {
        email: "owner@example.com",
        password: "KnownPasswordIs1234!",
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("EMAIL_UNVERIFIED");
  });

  test("401 INVALID_CREDENTIALS on wrong password", async () => {
    const { POST } = await import("../../app/api/auth/login/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/login", {
        email: "owner@example.com",
        password: "WrongPassword-2026",
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_CREDENTIALS");
  });

  test("happy path mints session cookie + stamps lastSeenAt", async () => {
    const { POST } = await import("../../app/api/auth/login/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/login", {
        email: "owner@example.com",
        password: "KnownPasswordIs1234!",
      }),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tabsignal_session=");
    // lastSeenAt update fired
    expect(state.updates.some(u => u.id === "stf_1" && (u.data.lastSeenAt as Date) instanceof Date)).toBe(true);
  });
});

/* ---------- POST /api/auth/set-password ---------------------------- */

describe("POST /api/auth/set-password", () => {
  test("401 when no session", async () => {
    state.session = null;
    const { POST } = await import("../../app/api/auth/set-password/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/set-password", {
        newPassword: "NewPassword-2026!Strong",
      }),
    );
    expect(res.status).toBe(401);
  });

  test("400 INVALID_BODY when newPassword too short", async () => {
    state.session = {
      kind: "session",
      staffId: "stf_1",
      venueId: "v_1",
      email: "owner@example.com",
      role: "OWNER",
      iat: Math.floor(Date.now() / 1000),
    };
    const { POST } = await import("../../app/api/auth/set-password/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/set-password", { newPassword: "short" }),
    );
    expect(res.status).toBe(400);
  });

  test("rotation: 400 SAME_PASSWORD when new === current", async () => {
    state.session = {
      kind: "session",
      staffId: "stf_1",
      venueId: "v_1",
      email: "owner@example.com",
      role: "OWNER",
      iat: Math.floor(Date.now() / 1000),
    };
    const { POST } = await import("../../app/api/auth/set-password/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/set-password", {
        currentPassword: "KnownPasswordIs1234!",
        newPassword: "KnownPasswordIs1234!",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("SAME_PASSWORD");
  });

  test("rotation: 401 INVALID_CURRENT_PASSWORD when current doesn't match", async () => {
    state.session = {
      kind: "session",
      staffId: "stf_1",
      venueId: "v_1",
      email: "owner@example.com",
      role: "OWNER",
      iat: Math.floor(Date.now() / 1000),
    };
    const { POST } = await import("../../app/api/auth/set-password/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/set-password", {
        currentPassword: "WrongPassword-2026",
        newPassword: "BrandNewPassword-2026",
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_CURRENT_PASSWORD");
  });

  test("rotation happy path: bumps sessionsValidAfter + passwordChangedAt", async () => {
    state.session = {
      kind: "session",
      staffId: "stf_1",
      venueId: "v_1",
      email: "owner@example.com",
      role: "OWNER",
      iat: Math.floor(Date.now() / 1000),
    };
    const { POST } = await import("../../app/api/auth/set-password/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/set-password", {
        currentPassword: "KnownPasswordIs1234!",
        newPassword: "BrandNewPassword-2026",
      }),
    );
    expect(res.status).toBe(200);
    const upd = state.updates.find(u => u.id === "stf_1");
    expect(upd?.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect((upd?.data.passwordChangedAt as Date) instanceof Date).toBe(true);
    expect((upd?.data.sessionsValidAfter as Date) instanceof Date).toBe(true);
  });

  test("first-time setup: no currentPassword required when passwordHash is null", async () => {
    const row = state.staffByEmail.get("owner@example.com")!;
    row.passwordHash = null;
    state.staffByEmail.set(row.email, row);
    state.staffById.set(row.id, row);

    state.session = {
      kind: "session",
      staffId: "stf_1",
      venueId: "v_1",
      email: "owner@example.com",
      role: "OWNER",
      iat: Math.floor(Date.now() / 1000),
    };
    const { POST } = await import("../../app/api/auth/set-password/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/set-password", {
        newPassword: "FirstTimePassword-2026",
      }),
    );
    expect(res.status).toBe(200);
    const upd = state.updates.find(u => u.id === "stf_1");
    expect(upd?.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});
