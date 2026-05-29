/**
 * Integration tests for the password-reset flow:
 *   - POST /api/auth/forgot-password  (issue a reset link)
 *   - POST /api/auth/reset-password   (consume token + set new password)
 *   - the password-reset token lifecycle in lib/auth/password-reset.ts
 *
 * Uses the REAL issueResetToken / consumeResetToken / hashStaffPassword
 * against a mocked @/lib/db whose passwordResetToken store round-trips by
 * tokenHash — so the token a forgot-password email embeds can actually be
 * redeemed by reset-password (a true end-to-end path). Only @/lib/db,
 * @/lib/rate-limit, @/lib/auth/email and @/lib/origin are mocked.
 *
 * Security properties asserted:
 *   - forgot-password returns an identical 200 whether or not the email
 *     exists (no enumeration), and silently no-ops for unknown /
 *     SUSPENDED / DELETED / INVITED accounts.
 *   - reset-password collapses invalid / expired / used tokens to one
 *     generic 400, re-checks status==ACTIVE at consume time, and on
 *     success bumps sessionsValidAfter (kills other-device sessions) and
 *     stamps emailVerifiedAt when it was null.
 *   - over-length passwords are rejected with a clean 400 (regression
 *     guard: the Zod cap must match hashStaffPassword's 128 ceiling, so a
 *     long password can't slip through to throw a 500).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

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
  email: string;
  name: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "DELETED";
  emailVerifiedAt: Date | null;
  venue: { name: string };
};

type TokenRow = {
  id: string;
  staffId: string;
  tokenHash: string;
  expiresAt: Date;
  requestIp: string | null;
  usedAt: Date | null;
};

type EmailSend = { to: string; link: string; staffName: string; venueName: string };

type StubState = {
  staffByEmail: Map<string, StaffRow>;
  staffById: Map<string, StaffRow>;
  tokensByHash: Map<string, TokenRow>;
  tokenSeq: number;
  tokenCreates: TokenRow[];
  updates: Array<{ id: string; data: Record<string, unknown> }>;
  emailSends: EmailSend[];
  rateLimitOk: boolean;
};

let state: StubState;

const flush = () => new Promise(r => setTimeout(r, 15));

beforeEach(() => {
  const row: StaffRow = {
    id: "stf_1",
    email: "owner@example.com",
    name: "Sam Owner",
    status: "ACTIVE",
    emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    venue: { name: "Luna Bistro" },
  };
  state = {
    staffByEmail: new Map([[row.email, row]]),
    staffById: new Map([[row.id, row]]),
    tokensByHash: new Map(),
    tokenSeq: 0,
    tokenCreates: [],
    updates: [],
    emailSends: [],
    rateLimitOk: true,
  };

  const tokenOps = {
    create: async ({ data }: { data: { staffId: string; tokenHash: string; expiresAt: Date; requestIp?: string | null } }) => {
      const rec: TokenRow = {
        id: `prt_${++state.tokenSeq}`,
        staffId: data.staffId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        requestIp: data.requestIp ?? null,
        usedAt: null,
      };
      state.tokensByHash.set(data.tokenHash, rec);
      state.tokenCreates.push(rec);
      return rec;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      state.tokensByHash.get(where.tokenHash) ?? null,
    updateMany: async ({ where, data }: { where: { id: string; usedAt: Date | null }; data: { usedAt: Date } }) => {
      const rec = [...state.tokensByHash.values()].find(r => r.id === where.id);
      if (!rec) return { count: 0 };
      // Mirror the `usedAt: null` guard in consumeResetToken's updateMany.
      if (where.usedAt === null && rec.usedAt !== null) return { count: 0 };
      rec.usedAt = data.usedAt;
      return { count: 1 };
    },
  };

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
      passwordResetToken: tokenOps,
      // consumeResetToken wraps its read+stamp in a transaction; hand the
      // callback a tx that shares the same token store.
      $transaction: async (fn: (tx: { passwordResetToken: typeof tokenOps }) => unknown) =>
        fn({ passwordResetToken: tokenOps }),
    },
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimit: () =>
      state.rateLimitOk ? { ok: true as const, retryAfterMs: 0 } : { ok: false as const, retryAfterMs: 3_600_000 },
    rateLimitAsync: async () =>
      state.rateLimitOk ? { ok: true as const } : { ok: false as const, retryAfterMs: 3_600_000 },
  }));

  mock.module("@/lib/auth/email", () => ({
    sendMagicLinkEmail: async () => undefined,
    sendPasswordResetEmail: async (args: EmailSend) => {
      state.emailSends.push(args);
    },
  }));

  mock.module("@/lib/origin", () => ({
    appOrigin: () => "https://tab-call.test",
  }));
});

function forgotReq(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("https://tab-call.test/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function resetReq(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("https://tab-call.test/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function tokenFromLastEmail(): string {
  const link = state.emailSends.at(-1)?.link ?? "";
  return new URL(link).searchParams.get("token") ?? "";
}

/* ---------- POST /api/auth/forgot-password ------------------------- */

describe("POST /api/auth/forgot-password", () => {
  test("400 INVALID_BODY for a malformed email", async () => {
    const { POST } = await import("../../app/api/auth/forgot-password/route");
    const res = await POST(forgotReq({ email: "nope" }));
    expect(res.status).toBe(400);
  });

  test("ACTIVE staff: 200 + issues a token + sends a reset email", async () => {
    const { POST } = await import("../../app/api/auth/forgot-password/route");
    const res = await POST(forgotReq({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    await flush();
    expect(state.tokenCreates.length).toBe(1);
    expect(state.emailSends.length).toBe(1);
    expect(state.emailSends[0].to).toBe("owner@example.com");
    expect(state.emailSends[0].venueName).toBe("Luna Bistro");
    // The emailed link carries a token that hashes to the stored row.
    expect(tokenFromLastEmail().length).toBeGreaterThan(20);
  });

  test("unknown email: still 200, but no token + no email (no enumeration)", async () => {
    const { POST } = await import("../../app/api/auth/forgot-password/route");
    const res = await POST(forgotReq({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    await flush();
    expect(state.tokenCreates.length).toBe(0);
    expect(state.emailSends.length).toBe(0);
  });

  test("SUSPENDED staff: 200 but silently no-ops", async () => {
    state.staffByEmail.get("owner@example.com")!.status = "SUSPENDED";
    const { POST } = await import("../../app/api/auth/forgot-password/route");
    const res = await POST(forgotReq({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    await flush();
    expect(state.tokenCreates.length).toBe(0);
    expect(state.emailSends.length).toBe(0);
  });

  test("INVITED staff: 200 but silently no-ops (they accept via magic link)", async () => {
    state.staffByEmail.get("owner@example.com")!.status = "INVITED";
    const { POST } = await import("../../app/api/auth/forgot-password/route");
    const res = await POST(forgotReq({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    await flush();
    expect(state.tokenCreates.length).toBe(0);
    expect(state.emailSends.length).toBe(0);
  });

  test("DELETED staff: 200 but silently no-ops", async () => {
    state.staffByEmail.get("owner@example.com")!.status = "DELETED";
    const { POST } = await import("../../app/api/auth/forgot-password/route");
    const res = await POST(forgotReq({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    await flush();
    expect(state.tokenCreates.length).toBe(0);
    expect(state.emailSends.length).toBe(0);
  });

  test("429 RATE_LIMITED when the limiter denies", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/auth/forgot-password/route");
    const res = await POST(forgotReq({ email: "owner@example.com" }));
    expect(res.status).toBe(429);
  });
});

/* ---------- POST /api/auth/reset-password -------------------------- */

describe("POST /api/auth/reset-password", () => {
  test("400 INVALID_BODY for a too-short password", async () => {
    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token: "whatever", password: "short" }));
    expect(res.status).toBe(400);
  });

  test("400 INVALID_BODY for an over-length password (>128) — clean 400, not a 500", async () => {
    // Regression guard for the Zod/​hasher mismatch: before the cap was
    // tightened to 128, a 129–200 char password passed validation and
    // then threw inside hashStaffPassword, surfacing as an opaque 500.
    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token: "whatever", password: "A1!".repeat(50) })); // 150 chars
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_BODY");
  });

  test("400 INVALID_OR_EXPIRED_TOKEN for an unknown token", async () => {
    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token: "never-issued-token", password: "BrandNewPassword-2026" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  test("400 for an expired token", async () => {
    const { issueResetToken } = await import("../auth/password-reset");
    const { token } = await issueResetToken({ staffId: "stf_1" });
    // Force expiry into the past.
    state.tokensByHash.get([...state.tokensByHash.keys()][0])!.expiresAt = new Date(Date.now() - 1000);

    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token, password: "BrandNewPassword-2026" }));
    expect(res.status).toBe(400);
  });

  test("400 for an already-used token", async () => {
    const { issueResetToken } = await import("../auth/password-reset");
    const { token } = await issueResetToken({ staffId: "stf_1" });
    state.tokensByHash.get([...state.tokensByHash.keys()][0])!.usedAt = new Date();

    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token, password: "BrandNewPassword-2026" }));
    expect(res.status).toBe(400);
  });

  test("400 when the staff row is no longer ACTIVE at consume time", async () => {
    const { issueResetToken } = await import("../auth/password-reset");
    const { token } = await issueResetToken({ staffId: "stf_1" });
    // Token is valid, but the account got suspended between issue + consume.
    state.staffById.get("stf_1")!.status = "SUSPENDED";

    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token, password: "BrandNewPassword-2026" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_OR_EXPIRED_TOKEN");
    // No password write should have happened.
    expect(state.updates.length).toBe(0);
  });

  test("happy path: sets passwordHash, bumps passwordChangedAt + sessionsValidAfter", async () => {
    const { issueResetToken } = await import("../auth/password-reset");
    const { token } = await issueResetToken({ staffId: "stf_1" });

    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token, password: "BrandNewPassword-2026" }));
    expect(res.status).toBe(200);

    const upd = state.updates.find(u => u.id === "stf_1");
    expect(upd?.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect((upd?.data.passwordChangedAt as Date) instanceof Date).toBe(true);
    expect((upd?.data.sessionsValidAfter as Date) instanceof Date).toBe(true);
    // emailVerifiedAt was already set — must NOT be overwritten.
    expect(upd?.data.emailVerifiedAt).toBeUndefined();
  });

  test("first reset doubles as verification: stamps emailVerifiedAt when it was null", async () => {
    state.staffById.get("stf_1")!.emailVerifiedAt = null;
    const { issueResetToken } = await import("../auth/password-reset");
    const { token } = await issueResetToken({ staffId: "stf_1" });

    const { POST } = await import("../../app/api/auth/reset-password/route");
    const res = await POST(resetReq({ token, password: "BrandNewPassword-2026" }));
    expect(res.status).toBe(200);
    const upd = state.updates.find(u => u.id === "stf_1");
    expect((upd?.data.emailVerifiedAt as Date) instanceof Date).toBe(true);
  });

  test("a token can only be redeemed once", async () => {
    const { issueResetToken } = await import("../auth/password-reset");
    const { token } = await issueResetToken({ staffId: "stf_1" });
    const { POST } = await import("../../app/api/auth/reset-password/route");

    const first = await POST(resetReq({ token, password: "BrandNewPassword-2026" }));
    expect(first.status).toBe(200);
    const second = await POST(resetReq({ token, password: "AnotherPassword-2026" }));
    expect(second.status).toBe(400);
  });
});

/* ---------- end-to-end: forgot -> email -> reset ------------------- */

describe("forgot-password -> reset-password end-to-end", () => {
  test("the emailed token can be redeemed to set a new password", async () => {
    const forgot = (await import("../../app/api/auth/forgot-password/route")).POST;
    const reset = (await import("../../app/api/auth/reset-password/route")).POST;

    const forgotRes = await forgot(forgotReq({ email: "owner@example.com" }));
    expect(forgotRes.status).toBe(200);
    await flush();

    const token = tokenFromLastEmail();
    expect(token.length).toBeGreaterThan(20);

    const resetRes = await reset(resetReq({ token, password: "EndToEndPassword-2026" }));
    expect(resetRes.status).toBe(200);
    const upd = state.updates.find(u => u.id === "stf_1");
    expect(upd?.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});
