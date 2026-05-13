/**
 * Integration-style tests for GET /api/auth/callback.
 *
 * Most security-critical of the auth flows — this is the endpoint that
 * mints session cookies. Tests cover:
 *   - the four redirect-error branches (missing / expired / invalid / suspended)
 *   - single-use jti enforcement via the P2002 unique-constraint path
 *   - INVITED → ACTIVE auto-promotion on first successful sign-in
 *   - safeNext open-redirect prevention via the `next` claim
 *   - operator default destination when no `next` is present
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { signLinkToken } from "../auth/token";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
const PREV_OPERATORS = process.env.OPERATOR_EMAILS;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
  if (PREV_OPERATORS === undefined) delete (process.env as Record<string, string>).OPERATOR_EMAILS;
  else (process.env as Record<string, string>).OPERATOR_EMAILS = PREV_OPERATORS;
});

type StaffStub = {
  id: string;
  email: string;
  venueId: string;
  role: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

type StubState = {
  staff: StaffStub | null;
  linkTokenUseShouldConflict: boolean;
  linkTokenUseCalls: Array<{ jti: string; staffId: string }>;
  staffUpdates: Array<{ id: string; data: Record<string, unknown> }>;
};

let state: StubState;

beforeEach(() => {
  state = {
    staff: null,
    linkTokenUseShouldConflict: false,
    linkTokenUseCalls: [],
    staffUpdates: [],
  };

  // Mock Prisma + the P2002 error class that the route checks for.
  class FakeKnownRequestError extends Error {
    code: string;
    constructor(code: string) {
      super(`Prisma error ${code}`);
      this.code = code;
    }
  }

  mock.module("@prisma/client", () => ({
    Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
  }));

  mock.module("@/lib/db", () => ({
    db: {
      staffMember: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (state.staff && state.staff.id === where.id) return state.staff;
          return null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          state.staffUpdates.push({ id: where.id, data });
          return { id: where.id, ...data };
        },
      },
      linkTokenUse: {
        create: async ({ data }: { data: { jti: string; staffId: string } }) => {
          state.linkTokenUseCalls.push(data);
          if (state.linkTokenUseShouldConflict) {
            throw new FakeKnownRequestError("P2002");
          }
          return { id: "ltu_1", ...data };
        },
      },
    },
  }));

  mock.module("@/lib/auth/operator", () => ({
    isPlatformStaffAsync: async (session: { email: string }) => {
      const operators = (process.env.OPERATOR_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      return operators.includes(session.email.toLowerCase());
    },
  }));
});

async function callbackReq(token: string | null, extra: Record<string, string> = {}): Promise<Request> {
  const url = new URL("https://tab-call.test/api/auth/callback");
  if (token) url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    method: "GET",
    headers: { host: "tab-call.test", "x-forwarded-proto": "https" },
  });
}

describe("GET /api/auth/callback", () => {
  test("redirects to /staff/login?err=missing when token is absent", async () => {
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(null));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/staff/login?err=missing",
    );
  });

  test("redirects to /staff/login?err=expired for unverifiable token", async () => {
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq("not.a.jwt"));
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/staff/login?err=expired",
    );
  });

  test("redirects to /staff/login?err=invalid when staff row missing", async () => {
    state.staff = null;
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_gone",
      email: "ghost@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/staff/login?err=invalid",
    );
  });

  test("redirects to /staff/login?err=invalid when email doesn't match staff row", async () => {
    state.staff = {
      id: "stf_1",
      email: "owner@example.com",
      venueId: "v_1",
      role: "OWNER",
      status: "ACTIVE",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "different@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/staff/login?err=invalid",
    );
  });

  test("redirects to /staff/login?err=already_used on jti replay (P2002)", async () => {
    state.staff = {
      id: "stf_1",
      email: "owner@example.com",
      venueId: "v_1",
      role: "OWNER",
      status: "ACTIVE",
    };
    state.linkTokenUseShouldConflict = true;
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "owner@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/staff/login?err=already_used",
    );
  });

  test("redirects to /staff/login?err=suspended for suspended staff (after jti burned)", async () => {
    state.staff = {
      id: "stf_1",
      email: "fired@example.com",
      venueId: "v_1",
      role: "SERVER",
      status: "SUSPENDED",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "fired@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/staff/login?err=suspended",
    );
    // jti was burned before the suspended check — the link is permanently
    // consumed. This is intentional defensive behaviour.
    expect(state.linkTokenUseCalls.length).toBe(1);
  });

  test("happy path: ACTIVE staff lands on /staff with session cookie", async () => {
    state.staff = {
      id: "stf_1",
      email: "owner@example.com",
      venueId: "v_1",
      role: "OWNER",
      status: "ACTIVE",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "owner@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe("https://tab-call.test/staff");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tabsignal_session=");
    // jti consumed exactly once.
    expect(state.linkTokenUseCalls.length).toBe(1);
  });

  test("INVITED staff is promoted to ACTIVE on first successful sign-in", async () => {
    state.staff = {
      id: "stf_invitee",
      email: "new@example.com",
      venueId: "v_1",
      role: "SERVER",
      status: "INVITED",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_invitee",
      email: "new@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    await GET(await callbackReq(token));
    // Update was called with status: "ACTIVE" AND lastSeenAt.
    expect(state.staffUpdates.length).toBe(1);
    const update = state.staffUpdates[0];
    expect(update.id).toBe("stf_invitee");
    expect(update.data.status).toBe("ACTIVE");
    expect(update.data.lastSeenAt).toBeInstanceOf(Date);
  });

  test("ACTIVE staff sign-in stamps lastSeenAt but does NOT toggle status", async () => {
    state.staff = {
      id: "stf_active",
      email: "active@example.com",
      venueId: "v_1",
      role: "MANAGER",
      status: "ACTIVE",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_active",
      email: "active@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    await GET(await callbackReq(token));
    expect(state.staffUpdates.length).toBe(1);
    const update = state.staffUpdates[0];
    expect(update.data.lastSeenAt).toBeInstanceOf(Date);
    expect(update.data.status).toBeUndefined();
  });

  test("honours claims.next when it is a safe same-origin path", async () => {
    state.staff = {
      id: "stf_1",
      email: "owner@example.com",
      venueId: "v_1",
      role: "OWNER",
      status: "ACTIVE",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "owner@example.com",
      next: "/admin/v/luna-lounge/onboarding",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/admin/v/luna-lounge/onboarding",
    );
  });

  test("rejects evil next claim and falls back to /staff", async () => {
    state.staff = {
      id: "stf_1",
      email: "owner@example.com",
      venueId: "v_1",
      role: "OWNER",
      status: "ACTIVE",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "owner@example.com",
      next: "//evil.com/phish",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe("https://tab-call.test/staff");
  });

  test("operator email without claims.next defaults to /operator", async () => {
    (process.env as Record<string, string>).OPERATOR_EMAILS = "ops@tab-call.com";
    state.staff = {
      id: "stf_op",
      email: "ops@tab-call.com",
      venueId: "v_1",
      role: "OWNER",
      status: "ACTIVE",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_op",
      email: "ops@tab-call.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token));
    expect(res.headers.get("location")).toBe("https://tab-call.test/operator");
  });

  test("URL ?next= param works when claims.next absent", async () => {
    state.staff = {
      id: "stf_1",
      email: "owner@example.com",
      venueId: "v_1",
      role: "OWNER",
      status: "ACTIVE",
    };
    const token = await signLinkToken({
      kind: "link",
      staffId: "stf_1",
      email: "owner@example.com",
    });
    const { GET } = await import("../../app/api/auth/callback/route");
    const res = await GET(await callbackReq(token, { next: "/admin/v/luna-lounge" }));
    expect(res.headers.get("location")).toBe(
      "https://tab-call.test/admin/v/luna-lounge",
    );
  });
});
