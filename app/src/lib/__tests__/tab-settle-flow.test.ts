/**
 * POST /api/session/[id]/settle — a member of staff closing out a tab.
 *
 * This is the only writer of GuestSession.paidAt since guest payments
 * were removed, and four features count from that column: Regulars
 * (visits), tip pools (window), the session export, and operator revenue
 * stats. If this route silently stops stamping, all four go quiet again
 * without an error anywhere — which is exactly how the gap arose in the
 * first place. Hence tests on the stamp itself, not just the status code.
 *
 * Also pinned: venue isolation, the permission gate, and idempotency —
 * two servers tapping "Close out" on the same table is an expected race,
 * and the first stamp has to stand so the visit time stays honest.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
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

type State = {
  staff: { kind: "session"; staffId: string; venueId: string; email: string; role: StaffRole } | null;
  session: {
    id: string;
    venueId: string;
    paidAt: Date | null;
    lineItems: unknown;
    table: { id: string; label: string };
  } | null;
  updates: { where: { id: string }; data: Record<string, unknown> }[];
  audits: Record<string, unknown>[];
};

const state: State = { staff: null, session: null, updates: [], audits: [] };

function resetState() {
  state.staff = {
    kind: "session",
    staffId: "staff_1",
    venueId: "venue_1",
    email: "wes@audit.local",
    role: "SERVER",
  };
  state.session = {
    id: "gs_1",
    venueId: "venue_1",
    paidAt: null,
    lineItems: [{ name: "House IPA", quantity: 2, unitCents: 800 }],
    table: { id: "tbl_1", label: "Table 1" },
  };
  state.updates = [];
  state.audits = [];
}

beforeEach(() => {
  resetState();

  mock.module("@/lib/db", () => ({
    db: {
      guestSession: {
        findUnique: async () => state.session,
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          state.updates.push(args);
          return {};
        },
      },
    },
  }));
  mock.module("@/lib/auth/session", () => ({ getStaffSession: async () => state.staff }));
  // Same-origin by default; one test overrides to prove the guard bites.
  mock.module("@/lib/csrf", () => ({ originGuard: () => null }));
  mock.module("@/lib/audit", () => ({
    audit: async (args: Record<string, unknown>) => { state.audits.push(args); },
  }));
  // Full export surface — a partial `events` here would leave sibling
  // suites (and this one) with undefined helpers depending on file order.
  mock.module("@/lib/realtime", () => ({
    emit: async () => undefined,
    events: {
      newRequest: async () => undefined,
      requestAcknowledged: async () => undefined,
      requestResolved: async () => undefined,
      orderPlaced: async () => undefined,
      orderStatusChanged: async () => undefined,
      regularArrived: async () => undefined,
    },
  }));
});

afterEach(() => { mock.restore(); });

const req = () => new Request("https://tab-call.test/api/session/gs_1/settle", { method: "POST" });
const ctx = { params: { id: "gs_1" } };

describe("POST /api/session/[id]/settle", () => {
  test("stamps paidAt — the column four features count from", async () => {
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadySettled: boolean; totalCents: number };
    expect(body.alreadySettled).toBe(false);
    expect(body.totalCents).toBe(1600);

    expect(state.updates.length).toBe(1);
    expect(state.updates[0]!.data.paidAt).toBeInstanceOf(Date);
  });

  test("is idempotent — a second close-out keeps the first timestamp", async () => {
    const first = new Date("2026-08-20T19:00:00.000Z");
    state.session!.paidAt = first;
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadySettled: boolean; settledAt: string };
    expect(body.alreadySettled).toBe(true);
    expect(body.settledAt).toBe(first.toISOString());
    // Crucially: no second write, so the visit time can't drift.
    expect(state.updates.length).toBe(0);
  });

  test("writes an audit row naming the table and total", async () => {
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    await POST(req(), ctx);
    expect(state.audits.length).toBe(1);
    expect(state.audits[0]!.action).toBe("tab.settled");
    expect(state.audits[0]!.metadata).toEqual({ tableLabel: "Table 1", totalCents: 1600 });
  });

  test("refuses a tab at another venue", async () => {
    state.session!.venueId = "venue_2";
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(state.updates.length).toBe(0);
  });

  test("refuses a role without tabs.settle", async () => {
    state.staff!.role = "VIEWER";
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(state.updates.length).toBe(0);
  });

  test("a SERVER can close out — it's their job at the table", async () => {
    state.staff!.role = "SERVER";
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    expect((await POST(req(), ctx)).status).toBe(200);
  });

  test("401s when signed out", async () => {
    state.staff = null;
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(state.updates.length).toBe(0);
  });

  test("fails closed on a cross-origin post", async () => {
    mock.module("@/lib/csrf", () => ({
      originGuard: () => ({ status: 403, error: "BAD_ORIGIN", detail: "cross-site" }),
    }));
    const { POST } = await import("../../app/api/session/[id]/settle/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(state.updates.length).toBe(0);
  });
});
