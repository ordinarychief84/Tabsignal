/**
 * Integration tests for POST /api/admin/v/[slug]/onboarding/complete.
 *
 * This is the endpoint the wizard's final "Launch venue" CTA hits. It
 * stamps Venue.onboardingCompletedAt = now() the first time, and is
 * idempotent on re-post (returns the existing timestamp).
 *
 * We mock the session, db, and permission helpers at the module level
 * and call the real route handler so any future regression in the
 * auth → ownership-check → idempotency path lights up here.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { StaffRole } from "@prisma/client";

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

type StubState = {
  session: SessionShape | null;
  venueBySlug: { id: string; onboardingCompletedAt: Date | null } | null;
  updatedTimestamps: Date[];
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
    venueBySlug: { id: "v_a", onboardingCompletedAt: null },
    updatedTimestamps: [],
  };

  // IMPORTANT: include ALL exports of the real module — Bun's
  // mock.module is process-wide. Partial stubs break sibling test files
  // that import the same module's other exports.
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

  mock.module("@/lib/db", () => ({
    db: {
      venue: {
        findUnique: async () => state.venueBySlug,
        update: async ({ data }: { data: { onboardingCompletedAt: Date } }) => {
          state.updatedTimestamps.push(data.onboardingCompletedAt);
          return { onboardingCompletedAt: data.onboardingCompletedAt };
        },
      },
    },
  }));
});

function makeReq(): Request {
  return new Request("https://tab-call.test/api/admin/v/luna-lounge/onboarding/complete", {
    method: "POST",
  });
}

describe("POST /api/admin/v/[slug]/onboarding/complete", () => {
  test("401 when there is no session", async () => {
    state.session = null;
    const { POST } = await import("../../app/api/admin/v/[slug]/onboarding/complete/route");
    const res = await POST(makeReq(), { params: { slug: "luna-lounge" } });
    expect(res.status).toBe(401);
    expect(state.updatedTimestamps.length).toBe(0);
  });

  test("404 when the venue slug doesn't exist", async () => {
    state.venueBySlug = null;
    const { POST } = await import("../../app/api/admin/v/[slug]/onboarding/complete/route");
    const res = await POST(makeReq(), { params: { slug: "missing" } });
    expect(res.status).toBe(404);
    expect(state.updatedTimestamps.length).toBe(0);
  });

  test("403 when the session venue doesn't match the slug's venue", async () => {
    state.venueBySlug = { id: "v_other", onboardingCompletedAt: null };
    const { POST } = await import("../../app/api/admin/v/[slug]/onboarding/complete/route");
    const res = await POST(makeReq(), { params: { slug: "luna-lounge" } });
    expect(res.status).toBe(403);
    expect(state.updatedTimestamps.length).toBe(0);
  });

  test("403 when the role can't edit venue settings (VIEWER)", async () => {
    state.session = { ...state.session!, role: "VIEWER" as StaffRole };
    const { POST } = await import("../../app/api/admin/v/[slug]/onboarding/complete/route");
    const res = await POST(makeReq(), { params: { slug: "luna-lounge" } });
    expect(res.status).toBe(403);
    expect(state.updatedTimestamps.length).toBe(0);
  });

  test("first-time POST stamps onboardingCompletedAt and returns ok:true alreadyCompleted:false", async () => {
    const { POST } = await import("../../app/api/admin/v/[slug]/onboarding/complete/route");
    const before = Date.now();
    const res = await POST(makeReq(), { params: { slug: "luna-lounge" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      alreadyCompleted: boolean;
      onboardingCompletedAt: string;
    };
    expect(body.ok).toBe(true);
    expect(body.alreadyCompleted).toBe(false);
    expect(body.onboardingCompletedAt).toBeTruthy();
    const stamped = new Date(body.onboardingCompletedAt).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 5);
    expect(state.updatedTimestamps.length).toBe(1);
  });

  test("re-POST is idempotent — no second write, returns existing timestamp", async () => {
    const existing = new Date("2026-04-01T10:00:00.000Z");
    state.venueBySlug = { id: "v_a", onboardingCompletedAt: existing };
    const { POST } = await import("../../app/api/admin/v/[slug]/onboarding/complete/route");
    const res = await POST(makeReq(), { params: { slug: "luna-lounge" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      alreadyCompleted: boolean;
      onboardingCompletedAt: string;
    };
    expect(body.ok).toBe(true);
    expect(body.alreadyCompleted).toBe(true);
    expect(body.onboardingCompletedAt).toBe(existing.toISOString());
    expect(state.updatedTimestamps.length).toBe(0);
  });

  test("legacy STAFF role gets normalised to OWNER for the permission check", async () => {
    state.session = { ...state.session!, role: "STAFF" as StaffRole };
    const { POST } = await import("../../app/api/admin/v/[slug]/onboarding/complete/route");
    const res = await POST(makeReq(), { params: { slug: "luna-lounge" } });
    expect(res.status).toBe(200);
    expect(state.updatedTimestamps.length).toBe(1);
  });
});
