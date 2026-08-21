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
  /** Emails that have an active PlatformAdmin row — TabCall's own people. */
  platformAdmins: Set<string>;
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
    platformAdmins: new Set<string>(),
  };

  // Own the operator boundary rather than reaching it through the db
  // mock. bun's module registry is process-wide and two sibling suites
  // install their own env-only stub of this module, so whose version
  // /api/auth/login sees depends on file order — the operator test below
  // passed standalone and failed in a full run. Every export is listed;
  // a partial stub would follow this file into the next suite.
  mock.module("@/lib/auth/operator", () => ({
    isOperator: () => false,
    isPlatformStaff: () => false,
    operatorAllowlist: () => [],
    isOperatorAsync: async (sess: { email: string } | null) =>
      !!sess && state.platformAdmins.has(sess.email.toLowerCase()),
    isPlatformStaffAsync: async (sess: { email: string } | null) =>
      !!sess && state.platformAdmins.has(sess.email.toLowerCase()),
  }));

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
      // /api/auth/login asks whether the caller is platform staff so it
      // can point operators at the console instead of the floor. Empty by
      // default — these are venue accounts; one test adds a row.
      platformAdmin: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          where.email && state.platformAdmins.has(where.email)
            ? { id: "pa_1", suspendedAt: null }
            : null,
      },
      orgMember: {
        findFirst: async () => null,
      },
    },
  }));

  // Mock session module FULL surface — sibling tests assume real exports.
  mock.module("@/lib/auth/session", () => ({
    SESSION_COOKIE: "tabsignal_session",
    sessionCookieOptions: () => ({
      httpOnly: true,
      secure: false,
      sameSite: "lax" as const,
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


  /* --------------------- where sign-in lands you -------------------- */

  test("honours a safe same-origin next", async () => {
    const { POST } = await import("../../app/api/auth/login/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/login", {
        email: "owner@example.com",
        password: "KnownPasswordIs1234!",
        next: "/admin/v/luna/menu",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).next).toBe("/admin/v/luna/menu");
  });

  test("refuses to bounce anywhere off-site", async () => {
    // An open redirect here would hand a phisher a tab-call.com link that
    // lands on their page with the victim freshly authenticated.
    const { POST } = await import("../../app/api/auth/login/route");
    for (const evil of ["//evil.example", "https://evil.example/x", "javascript:alert(1)"]) {
      const res = await POST(
        makeReq("https://tab-call.test/api/auth/login", {
          email: "owner@example.com",
          password: "KnownPasswordIs1234!",
          next: evil,
        }),
      );
      expect((await res.json()).next).toBe("/staff");
    }
  });

  test("with no next, a venue account lands on the floor", async () => {
    const { POST } = await import("../../app/api/auth/login/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/login", {
        email: "owner@example.com",
        password: "KnownPasswordIs1234!",
      }),
    );
    expect((await res.json()).next).toBe("/staff");
  });

  test("with no next, an operator lands in the platform console", async () => {
    // Matches what /api/auth/callback picks, so both ways in agree —
    // before this, password sign-in always dumped operators on the floor.
    // Identified by a PlatformAdmin row rather than OPERATOR_EMAILS:
    // that env var is unset in production, and it's read once at module
    // load so a test can't flip it anyway.
    state.platformAdmins.add("owner@example.com");
    const { POST } = await import("../../app/api/auth/login/route");
    const res = await POST(
      makeReq("https://tab-call.test/api/auth/login", {
        email: "owner@example.com",
        password: "KnownPasswordIs1234!",
      }),
    );
    expect((await res.json()).next).toBe("/operator");
  });

  test("per-email lockout: 10 attempts allowed, 11th returns 429 RATE_LIMITED", async () => {
    // Sibling test files install a `mock.module("@/lib/rate-limit",
    // () => ({ rateLimitAsync: alwaysOk }))` stub that leaks into this
    // file via Bun's process-wide mock layer. We install a deterministic
    // counting limiter scoped to THIS test (and restore the polluter's
    // always-ok stub immediately after so sibling set-password tests
    // that follow are unaffected). The behaviour we mimic is the real
    // in-memory rate-limiter: per-key counter with windowMs eviction.
    const counts = new Map<string, { count: number; expiresAt: number }>();
    mock.module("@/lib/rate-limit", () => ({
      rateLimit: (key: string, opts: { windowMs: number; max: number }) => {
        const now = Date.now();
        const cur = counts.get(key);
        const entry = cur && cur.expiresAt > now ? cur : { count: 0, expiresAt: now + opts.windowMs };
        entry.count += 1;
        counts.set(key, entry);
        return entry.count <= opts.max
          ? { ok: true as const, retryAfterMs: 0 }
          : { ok: false as const, retryAfterMs: entry.expiresAt - now };
      },
      rateLimitAsync: async (key: string, opts: { windowMs: number; max: number }) => {
        const now = Date.now();
        const cur = counts.get(key);
        const entry = cur && cur.expiresAt > now ? cur : { count: 0, expiresAt: now + opts.windowMs };
        entry.count += 1;
        counts.set(key, entry);
        return entry.count <= opts.max
          ? { ok: true as const }
          : { ok: false as const, retryAfterMs: entry.expiresAt - now };
      },
    }));

    const email = `lockout-${Date.now()}@example.com`;
    const ip = `9.${(Date.now() >> 16) & 0xff}.${(Date.now() >> 8) & 0xff}.${Date.now() & 0xff}`;
    const { POST } = await import("../../app/api/auth/login/route");

    function attempt() {
      return POST(
        new Request("https://tab-call.test/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ email, password: "anything-1234567" }),
        }),
      );
    }

    try {
      // The route's per-email window is 10/hour. First 10 attempts
      // pass the gate and reach the credential check (returns 401
      // INVALID_CREDENTIALS for the non-existent email); 11th hits
      // 429 RATE_LIMITED at the gate.
      for (let i = 1; i <= 10; i++) {
        const res = await attempt();
        expect(res.status).toBe(401);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("INVALID_CREDENTIALS");
      }
      const overLimit = await attempt();
      expect(overLimit.status).toBe(429);
      const body = (await overLimit.json()) as { error: string; retryAfterMs: number };
      expect(body.error).toBe("RATE_LIMITED");
      expect(body.retryAfterMs).toBeGreaterThan(0);
    } finally {
      // Restore the always-ok stub so sibling set-password tests that
      // run after us in this file aren't accidentally rate-limited
      // through our deterministic counter.
      mock.module("@/lib/rate-limit", () => ({
        rateLimit: () => ({ ok: true as const, retryAfterMs: 0 }),
        rateLimitAsync: async () => ({ ok: true as const }),
      }));
    }
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

  test("first-time setup does NOT sign the caller out", async () => {
    // The account most likely to be here is an invited server who just
    // tapped their invite on a phone. There is no old password to cut
    // off, so ending their session to make them retype the one they chose
    // ten seconds ago protects nothing and strands them mid-shift.
    const row = state.staffByEmail.get("owner@example.com")!;
    row.passwordHash = null;
    // Arriving from an invite link, which is the case this covers.
    row.emailVerifiedAt = null;
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
    expect((await res.json()).signedOut).toBe(false);
    const upd = state.updates.find(u => u.id === "stf_1");
    expect(upd?.data.sessionsValidAfter).toBeUndefined();
    // The link only reached them because it was delivered to that
    // address, so setting a password from it settles verification too.
    expect((upd?.data.emailVerifiedAt as Date) instanceof Date).toBe(true);
  });

  test("rotation DOES sign the caller out, and says so", async () => {
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
        newPassword: "RotatedPassword-2026",
      }),
    );
    expect(res.status).toBe(200);
    // The form reads this to decide between "carry on" and "sign in again".
    expect((await res.json()).signedOut).toBe(true);
  });
});
