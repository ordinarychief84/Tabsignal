/**
 * Integration-style tests for the owner-console request lifecycle:
 *
 *   PATCH /api/requests/[id]/acknowledge   (PENDING  -> ACKNOWLEDGED)
 *   PATCH /api/requests/[id]/handoff       (reassign acker, keep SLA)
 *   PATCH /api/requests/[id]/resolve       (any       -> RESOLVED)
 *
 * These are the three writes the live-requests queue (the "TabCall owner
 * console" at /admin/v/[slug]/requests) fires as a guest's call moves
 * through the floor. The permission matrix is covered in permissions.test.ts;
 * this file covers the HTTP-layer wiring: auth (401), CSRF (403), venue
 * isolation (403/404), and the compare-and-swap invariants that keep two
 * servers from stepping on each other — first-acker-wins and idempotent
 * resolve.
 *
 * The CSRF originGuard is exercised for real (not mocked): requests carry
 * `sec-fetch-site: same-origin` to pass, and one test sends `cross-site`
 * to prove the guard fails closed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RequestStatus, RequestType, StaffRole } from "@prisma/client";

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

type RequestRow = {
  id: string;
  venueId: string;
  sessionId: string;
  type: RequestType;
  status: RequestStatus;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
  tableLabel: string;
};

type StaffRow = { id: string; venueId: string; name: string };

type EmitRecord = { method: string; args: unknown[] };

type StubState = {
  session: SessionShape | null;
  requests: Map<string, RequestRow>;
  staff: Map<string, StaffRow>;
  emits: EmitRecord[];
};

let state: StubState;

// Shape a stored row the way Prisma would, honoring the `include` arg the
// route passed (table.label + acknowledgedBy.{id,name}).
function shape(row: RequestRow, include?: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  if (include?.table) out.table = { label: row.tableLabel };
  if (include?.acknowledgedBy) {
    const acker = row.acknowledgedById ? state.staff.get(row.acknowledgedById) : null;
    out.acknowledgedBy = acker ? { id: acker.id, name: acker.name } : null;
  }
  return out;
}

beforeEach(() => {
  state = {
    session: {
      kind: "session",
      staffId: "stf_alice",
      venueId: "v_a",
      email: "alice@a.com",
      role: "SERVER" as StaffRole,
    },
    requests: new Map([
      [
        "req_1",
        {
          id: "req_1",
          venueId: "v_a",
          sessionId: "sess_1",
          type: "DRINK" as RequestType,
          status: "PENDING" as RequestStatus,
          acknowledgedById: null,
          acknowledgedAt: null,
          resolvedAt: null,
          resolutionAction: null,
          resolutionNote: null,
          tableLabel: "T12",
        },
      ],
    ]),
    staff: new Map([
      ["stf_alice", { id: "stf_alice", venueId: "v_a", name: "Alice" }],
      ["stf_bob", { id: "stf_bob", venueId: "v_a", name: "Bob" }],
      ["stf_carol_other", { id: "stf_carol_other", venueId: "v_b", name: "Carol" }],
    ]),
    emits: [],
  };

  // IMPORTANT: include ALL exports of the real module. Bun's mock.module
  // is process-wide and persists across files in a shared worker.
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

  mock.module("@/lib/realtime", () => {
    const record = (method: string) => (...args: unknown[]) => {
      state.emits.push({ method, args });
      return Promise.resolve();
    };
    return {
      emit: record("emit"),
      events: {
        newRequest: record("newRequest"),
        requestAcknowledged: record("requestAcknowledged"),
        requestResolved: record("requestResolved"),
      },
    };
  });

  mock.module("@/lib/db", () => ({
    db: {
      request: {
        findUnique: async ({
          where,
          include,
        }: {
          where: { id: string };
          include?: Record<string, unknown>;
        }) => {
          const row = state.requests.get(where.id);
          return row ? shape(row, include) : null;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: {
            id: string;
            acknowledgedById?: null;
            status?: RequestStatus | { not: RequestStatus };
          };
          data: Partial<RequestRow>;
        }) => {
          const row = state.requests.get(where.id);
          if (!row) return { count: 0 };
          // Honor the CAS predicate the route encoded in `where`.
          if (where.acknowledgedById === null && row.acknowledgedById !== null) {
            return { count: 0 };
          }
          if (where.status !== undefined) {
            if (typeof where.status === "object" && "not" in where.status) {
              if (row.status === where.status.not) return { count: 0 };
            } else if (row.status !== where.status) {
              return { count: 0 };
            }
          }
          Object.assign(row, data);
          return { count: 1 };
        },
        update: async ({
          where,
          data,
          include,
        }: {
          where: { id: string };
          data: Partial<RequestRow>;
          include?: Record<string, unknown>;
        }) => {
          const row = state.requests.get(where.id);
          if (!row) throw new Error("record not found");
          Object.assign(row, data);
          return shape(row, include);
        },
      },
      staffMember: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          state.staff.get(where.id) ?? null,
      },
    },
  }));
});

function makeReq(url: string, body?: unknown, fetchSite = "same-origin"): Request {
  return new Request(`https://tab-call.test${url}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": fetchSite,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ackUrl = (id: string) => `/api/requests/${id}/acknowledge`;
const resolveUrl = (id: string) => `/api/requests/${id}/resolve`;
const handoffUrl = (id: string) => `/api/requests/${id}/handoff`;

describe("PATCH /api/requests/[id]/acknowledge", () => {
  test("401 UNAUTHORIZED when no session", async () => {
    state.session = null;
    const { PATCH } = await import("../../app/api/requests/[id]/acknowledge/route");
    const res = await PATCH(makeReq(ackUrl("req_1")), { params: { id: "req_1" } });
    expect(res.status).toBe(401);
  });

  test("403 CSRF_BLOCKED on a cross-site request", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/acknowledge/route");
    const res = await PATCH(
      makeReq(ackUrl("req_1"), undefined, "cross-site"),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("CSRF_BLOCKED");
  });

  test("404 NOT_FOUND when the request does not exist", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/acknowledge/route");
    const res = await PATCH(makeReq(ackUrl("req_nope")), { params: { id: "req_nope" } });
    expect(res.status).toBe(404);
  });

  test("403 FORBIDDEN when the request belongs to another venue", async () => {
    state.session = { ...(state.session as SessionShape), venueId: "v_other" };
    const { PATCH } = await import("../../app/api/requests/[id]/acknowledge/route");
    const res = await PATCH(makeReq(ackUrl("req_1")), { params: { id: "req_1" } });
    expect(res.status).toBe(403);
  });

  test("200 PENDING -> ACKNOWLEDGED claims the request for the acker", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/acknowledge/route");
    const res = await PATCH(makeReq(ackUrl("req_1")), { params: { id: "req_1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      acknowledgedById: string;
      acknowledgedBy: { name: string };
    };
    expect(body.status).toBe("ACKNOWLEDGED");
    expect(body.acknowledgedById).toBe("stf_alice");
    expect(body.acknowledgedBy.name).toBe("Alice");
    expect(state.requests.get("req_1")?.acknowledgedById).toBe("stf_alice");
    // Emits to the venue + guest rooms so both queue and guest UI update.
    expect(state.emits.some(e => e.method === "requestAcknowledged")).toBe(true);
  });

  test("first-acker-wins: a second acker gets alreadyAcked and does not steal the claim", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/acknowledge/route");
    await PATCH(makeReq(ackUrl("req_1")), { params: { id: "req_1" } }); // Alice claims

    state.session = {
      kind: "session",
      staffId: "stf_bob",
      venueId: "v_a",
      email: "bob@a.com",
      role: "SERVER" as StaffRole,
    };
    const res = await PATCH(makeReq(ackUrl("req_1")), { params: { id: "req_1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyAcked?: boolean };
    expect(body.alreadyAcked).toBe(true);
    // Still Alice's — Bob's tap did not overwrite the acker.
    expect(state.requests.get("req_1")?.acknowledgedById).toBe("stf_alice");
  });

  test("409 ALREADY_RESOLVED when acknowledging a resolved request", async () => {
    const row = state.requests.get("req_1")!;
    row.status = "RESOLVED" as RequestStatus;
    const { PATCH } = await import("../../app/api/requests/[id]/acknowledge/route");
    const res = await PATCH(makeReq(ackUrl("req_1")), { params: { id: "req_1" } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ALREADY_RESOLVED");
  });
});

describe("PATCH /api/requests/[id]/handoff", () => {
  beforeEach(() => {
    // Start from an acknowledged-by-Alice request for handoff scenarios.
    const row = state.requests.get("req_1")!;
    row.status = "ACKNOWLEDGED" as RequestStatus;
    row.acknowledgedById = "stf_alice";
    row.acknowledgedAt = new Date("2026-06-03T12:00:00.000Z");
  });

  test("200 reassigns the acker and preserves acknowledgedAt (SLA not reset)", async () => {
    const ackedAtBefore = state.requests.get("req_1")!.acknowledgedAt;
    const { PATCH } = await import("../../app/api/requests/[id]/handoff/route");
    const res = await PATCH(
      makeReq(handoffUrl("req_1"), { toStaffId: "stf_bob" }),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { acknowledgedById: string };
    expect(body.acknowledgedById).toBe("stf_bob");
    expect(state.requests.get("req_1")?.acknowledgedById).toBe("stf_bob");
    expect(state.requests.get("req_1")?.acknowledgedAt).toEqual(ackedAtBefore);
    // Receiver gets a personal "handed off to you" ping.
    expect(state.emits.some(e => e.method === "emit")).toBe(true);
  });

  test("409 NOT_ACKNOWLEDGED when the request is still PENDING", async () => {
    const row = state.requests.get("req_1")!;
    row.status = "PENDING" as RequestStatus;
    row.acknowledgedById = null;
    const { PATCH } = await import("../../app/api/requests/[id]/handoff/route");
    const res = await PATCH(
      makeReq(handoffUrl("req_1"), { toStaffId: "stf_bob" }),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NOT_ACKNOWLEDGED");
  });

  test("400 INVALID_STAFF when the destination is at another venue", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/handoff/route");
    const res = await PATCH(
      makeReq(handoffUrl("req_1"), { toStaffId: "stf_carol_other" }),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_STAFF");
  });

  test("noChange when handing off to the staff who already holds it", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/handoff/route");
    const res = await PATCH(
      makeReq(handoffUrl("req_1"), { toStaffId: "stf_alice" }),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { noChange?: boolean };
    expect(body.noChange).toBe(true);
  });
});

describe("PATCH /api/requests/[id]/resolve", () => {
  test("400 ACTION_REQUIRED when no resolution action is supplied", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/resolve/route");
    const res = await PATCH(makeReq(resolveUrl("req_1"), {}), { params: { id: "req_1" } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ACTION_REQUIRED");
  });

  test("200 records the resolution action and flips to RESOLVED", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/resolve/route");
    const res = await PATCH(
      makeReq(resolveUrl("req_1"), { action: "SERVED", note: "two pints" }),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; resolutionAction: string };
    expect(body.status).toBe("RESOLVED");
    expect(body.resolutionAction).toBe("SERVED");
    const row = state.requests.get("req_1")!;
    expect(row.status).toBe("RESOLVED");
    expect(row.resolutionNote).toBe("two pints");
    expect(state.emits.some(e => e.method === "requestResolved")).toBe(true);
  });

  test("idempotent resolve: a second tap returns alreadyResolved and keeps the first resolvedAt", async () => {
    const { PATCH } = await import("../../app/api/requests/[id]/resolve/route");
    await PATCH(makeReq(resolveUrl("req_1"), { action: "SERVED" }), { params: { id: "req_1" } });
    const firstResolvedAt = state.requests.get("req_1")!.resolvedAt;

    const res = await PATCH(
      makeReq(resolveUrl("req_1"), { action: "COMPED" }),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyResolved?: boolean };
    expect(body.alreadyResolved).toBe(true);
    // The second action did not overwrite the original resolution.
    expect(state.requests.get("req_1")?.resolutionAction).toBe("SERVED");
    expect(state.requests.get("req_1")?.resolvedAt).toEqual(firstResolvedAt);
  });

  test("403 FORBIDDEN when resolving another venue's request", async () => {
    state.session = { ...(state.session as SessionShape), venueId: "v_other" };
    const { PATCH } = await import("../../app/api/requests/[id]/resolve/route");
    const res = await PATCH(
      makeReq(resolveUrl("req_1"), { action: "SERVED" }),
      { params: { id: "req_1" } }
    );
    expect(res.status).toBe(403);
  });
});

describe("end-to-end: PENDING -> ACKNOWLEDGED -> handoff -> RESOLVED", () => {
  test("a call walks the full owner-console lifecycle", async () => {
    const { PATCH: ack } = await import("../../app/api/requests/[id]/acknowledge/route");
    const { PATCH: handoff } = await import("../../app/api/requests/[id]/handoff/route");
    const { PATCH: resolve } = await import("../../app/api/requests/[id]/resolve/route");

    // Alice acknowledges.
    let res = await ack(makeReq(ackUrl("req_1")), { params: { id: "req_1" } });
    expect(res.status).toBe(200);
    expect(state.requests.get("req_1")?.status).toBe("ACKNOWLEDGED");
    expect(state.requests.get("req_1")?.acknowledgedById).toBe("stf_alice");

    // Alice hands off to Bob mid-shift.
    res = await handoff(makeReq(handoffUrl("req_1"), { toStaffId: "stf_bob" }), {
      params: { id: "req_1" },
    });
    expect(res.status).toBe(200);
    expect(state.requests.get("req_1")?.acknowledgedById).toBe("stf_bob");

    // Bob resolves it.
    res = await resolve(makeReq(resolveUrl("req_1"), { action: "SERVED" }), {
      params: { id: "req_1" },
    });
    expect(res.status).toBe(200);
    expect(state.requests.get("req_1")?.status).toBe("RESOLVED");
    expect(state.requests.get("req_1")?.resolutionAction).toBe("SERVED");
  });
});
