/**
 * Integration-style tests for POST /api/admin/staff (manager-led invite).
 *
 * The role-permission matrix itself lives in `permissions.test.ts` and is
 * already exhaustive. This file covers the HTTP-layer wiring: 401/403/409
 * branches, idempotent reinvite, and the audit-side-effect on first
 * invite vs. a no-op reinvite.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { StaffRole, StaffStatus } from "@prisma/client";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

type SessionShape = {
  kind: "session";
  staffId: string;
  venueId: string;
  email: string;
  role: StaffRole;
};

type ExistingStaff = {
  id: string;
  email: string;
  name: string;
  venueId: string;
  role: StaffRole;
  status: StaffStatus;
};

type StubState = {
  session: SessionShape | null;
  isManager: boolean;
  venue: { id: string; name: string } | null;
  existingByEmail: ExistingStaff | null;
  creates: Array<{ email: string; role: StaffRole; venueId: string }>;
  emailSends: number;
  audits: Array<{ action: string; targetType: string }>;
};

let state: StubState;

beforeEach(() => {
  state = {
    session: {
      kind: "session",
      staffId: "stf_owner",
      venueId: "v_a",
      email: "owner@a.com",
      role: "OWNER" as StaffRole,
    },
    isManager: true,
    venue: { id: "v_a", name: "Venue A" },
    existingByEmail: null,
    creates: [],
    emailSends: 0,
    audits: [],
  };

  // IMPORTANT: include ALL exports of the real module. Bun's mock.module
  // is process-wide and persists across test files; if we only stub
  // getStaffSession, the auth-callback tests' import of SESSION_COOKIE
  // and sessionCookieOptions explodes when they share a worker.
  mock.module("@/lib/auth/session", () => ({
    getStaffSession: async () => state.session,
    SESSION_COOKIE: "tabsignal_session",
    sessionCookieOptions: () => ({
      httpOnly: true,
      secure: true,
      sameSite: "strict" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
  }));

  mock.module("@/lib/auth/venue-role", () => ({
    isVenueManager: async (_s: SessionShape, _vid: string) => state.isManager,
  }));

  mock.module("@/lib/db", () => ({
    db: {
      venue: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          state.venue && state.venue.id === where.id ? state.venue : null,
      },
      staffMember: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id && state.session && where.id === state.session.staffId) {
            return { id: state.session.staffId };
          }
          if (where.email && state.existingByEmail?.email === where.email) {
            return state.existingByEmail;
          }
          return null;
        },
        create: async ({ data }: { data: { email: string; name: string; role: StaffRole; venueId: string } }) => {
          state.creates.push({ email: data.email, role: data.role, venueId: data.venueId });
          return {
            id: `stf_${state.creates.length}`,
            email: data.email,
            name: data.name,
            role: data.role,
            status: "INVITED" as StaffStatus,
            section: null,
            lastSeenAt: null,
            invitedById: state.session?.staffId ?? null,
            venueId: data.venueId,
          };
        },
      },
    },
  }));

  mock.module("@/lib/auth/email", () => ({
    sendMagicLinkEmail: async () => {
      state.emailSends += 1;
    },
  }));

  mock.module("@/lib/origin", () => ({
    appOrigin: () => "https://tab-call.test",
  }));

  mock.module("@/lib/audit", () => ({
    audit: (entry: { action: string; targetType: string }) => {
      state.audits.push({ action: entry.action, targetType: entry.targetType });
    },
  }));
});

function makeReq(body: unknown): Request {
  return new Request("https://tab-call.test/api/admin/staff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/staff", () => {
  test("401 UNAUTHORIZED when no session", async () => {
    state.session = null;
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(makeReq({ email: "new@a.com", name: "New Server" }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("403 FORBIDDEN when caller is not a venue manager", async () => {
    state.isManager = false;
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(makeReq({ email: "new@a.com", name: "New Server" }));
    expect(res.status).toBe(403);
  });

  test("403 FORBIDDEN when role lacks staff.invite", async () => {
    state.session = {
      ...(state.session as SessionShape),
      role: "VIEWER" as StaffRole,
    };
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(makeReq({ email: "new@a.com", name: "New Server" }));
    expect(res.status).toBe(403);
  });

  test("400 INVALID_BODY when email is malformed", async () => {
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(makeReq({ email: "not-an-email", name: "New" }));
    expect(res.status).toBe(400);
  });

  test("403 when assigning MANAGER from a Manager-tier caller without role.assign_manager", async () => {
    // MANAGER can invite SERVER but NOT promote/peer-create another MANAGER.
    state.session = {
      ...(state.session as SessionShape),
      role: "MANAGER" as StaffRole,
    };
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(makeReq({ email: "new@a.com", name: "Try Manager", role: "MANAGER" }));
    expect(res.status).toBe(403);
  });

  test("409 EMAIL_ALREADY_USED_AT_OTHER_VENUE when email exists at another venue", async () => {
    state.existingByEmail = {
      id: "stf_x",
      email: "shared@example.com",
      name: "Cross Venue",
      venueId: "v_b",
      role: "SERVER" as StaffRole,
      status: "ACTIVE" as StaffStatus,
    };
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(makeReq({ email: "shared@example.com", name: "Cross Venue" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("EMAIL_ALREADY_USED_AT_OTHER_VENUE");
  });

  test("idempotent reinvite at the same venue does NOT create a duplicate row and does NOT re-audit", async () => {
    state.existingByEmail = {
      id: "stf_existing",
      email: "again@a.com",
      name: "Already Here",
      venueId: "v_a",
      role: "SERVER" as StaffRole,
      status: "INVITED" as StaffStatus,
    };
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(makeReq({ email: "again@a.com", name: "Already Here" }));
    expect(res.status).toBe(200);
    expect(state.creates.length).toBe(0);
    expect(state.audits.length).toBe(0);
    // But a magic link DID go out — re-issuing the sign-in link is the
    // whole point of a reinvite.
    expect(state.emailSends).toBe(1);
  });

  test("happy path: creates StaffMember, sends magic link, writes audit log", async () => {
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(
      makeReq({
        email: "fresh@a.com",
        name: "Fresh Server",
        role: "SERVER",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; role: StaffRole; status: StaffStatus };
    expect(body.email).toBe("fresh@a.com");
    expect(body.role).toBe("SERVER");
    expect(body.status).toBe("INVITED");
    expect(state.creates.length).toBe(1);
    expect(state.creates[0].venueId).toBe("v_a");
    expect(state.emailSends).toBe(1);
    expect(state.audits.length).toBe(1);
    expect(state.audits[0].action).toBe("staff.invited");
  });

  test("send=false creates row but skips email", async () => {
    const { POST } = await import("../../app/api/admin/staff/route");
    const res = await POST(
      makeReq({ email: "silent@a.com", name: "Silent", role: "SERVER", send: false }),
    );
    expect(res.status).toBe(200);
    expect(state.creates.length).toBe(1);
    expect(state.emailSends).toBe(0);
  });
});
