/**
 * Wearable-device flow tests — the /api/wear/* surface consumed by
 * sdk/tabcall-wear:
 *
 *   POST /api/wear/pair                     (staff session → 6-digit code)
 *   POST /api/wear/claim                    (code → device bearer token)
 *   GET  /api/wear/queue                    (compact polling queue)
 *   POST /api/wear/requests/[id]/ack        (first-acker-wins CAS)
 *   POST /api/wear/requests/[id]/resolve    (idempotent, action required)
 *
 * Covers the token lifecycle end-to-end: a token minted by a real claim
 * round-trips through getWearAuth on subsequent calls, revocation and
 * rotation kill it, venue isolation holds, and the queue's pacing hint
 * flips with floor state. jose signing runs for real (test secret);
 * only db / rate-limit / realtime are stubbed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RequestStatus, RequestType, StaffStatus } from "@prisma/client";

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
  name: string;
  status: StaffStatus;
  sessionsValidAfter: Date | null;
  venue: { id: string; name: string; slug: string };
};

type DeviceRow = {
  id: string;
  staffId: string;
  name: string;
  platform: string;
  fcmToken: string | null;
  tokenIssuedAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
};

type PairCodeRow = {
  id: string;
  staffId: string;
  codeHash: string;
  expiresAt: Date;
  claimedAt: Date | null;
};

type RequestRow = {
  id: string;
  venueId: string;
  sessionId: string;
  type: RequestType;
  status: RequestStatus;
  note: string | null;
  idCheckRequired: boolean;
  createdAt: Date;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
  tableLabel: string;
  assignedStaffIds: string[];
};

type StubState = {
  session: { kind: "session"; staffId: string; venueId: string; email: string; role: string } | null;
  rateLimitOk: boolean;
  staff: Map<string, StaffRow>;
  devices: Map<string, DeviceRow>;
  pairCodes: Map<string, PairCodeRow>; // keyed by codeHash
  requests: Map<string, RequestRow>;
  emits: string[];
  seq: number;
};

let state: StubState;

function shapeRequest(row: RequestRow, include?: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  if (include?.table) {
    out.table = {
      label: row.tableLabel,
      assignments: row.assignedStaffIds.map(id => ({ staffMemberId: id })),
    };
  }
  if (include?.acknowledgedBy) {
    const acker = row.acknowledgedById ? state.staff.get(row.acknowledgedById) : null;
    out.acknowledgedBy = acker ? { id: acker.id, name: acker.name } : null;
  }
  return out;
}

beforeEach(() => {
  const venueA = { id: "v_a", name: "Velvet Hour", slug: "velvet-hour" };
  const venueB = { id: "v_b", name: "Other Bar", slug: "other-bar" };
  state = {
    session: { kind: "session", staffId: "stf_maya", venueId: "v_a", email: "maya@a.com", role: "SERVER" },
    rateLimitOk: true,
    staff: new Map([
      ["stf_maya", { id: "stf_maya", venueId: "v_a", name: "Maya", status: "ACTIVE" as StaffStatus, sessionsValidAfter: null, venue: venueA }],
      ["stf_dee", { id: "stf_dee", venueId: "v_a", name: "Dee", status: "ACTIVE" as StaffStatus, sessionsValidAfter: null, venue: venueA }],
      ["stf_zoe_other", { id: "stf_zoe_other", venueId: "v_b", name: "Zoe", status: "ACTIVE" as StaffStatus, sessionsValidAfter: null, venue: venueB }],
    ]),
    devices: new Map(),
    pairCodes: new Map(),
    requests: new Map([
      ["req_1", {
        id: "req_1", venueId: "v_a", sessionId: "gs_1", type: "DRINK" as RequestType,
        status: "PENDING" as RequestStatus, note: null, idCheckRequired: false,
        createdAt: new Date(Date.now() - 30_000),
        acknowledgedById: null, acknowledgedAt: null, resolvedAt: null,
        resolutionAction: null, resolutionNote: null,
        tableLabel: "Table 7", assignedStaffIds: ["stf_maya"],
      }],
      ["req_other_venue", {
        id: "req_other_venue", venueId: "v_b", sessionId: "gs_9", type: "HELP" as RequestType,
        status: "PENDING" as RequestStatus, note: null, idCheckRequired: false,
        createdAt: new Date(Date.now() - 10_000),
        acknowledgedById: null, acknowledgedAt: null, resolvedAt: null,
        resolutionAction: null, resolutionNote: null,
        tableLabel: "B1", assignedStaffIds: [],
      }],
    ]),
    emits: [],
    seq: 0,
  };

  mock.module("@/lib/auth/session", () => ({
    getStaffSession: async () => state.session,
    SESSION_COOKIE: "tabsignal_session",
    sessionCookieOptions: () => ({
      httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: 2_592_000,
    }),
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () =>
      state.rateLimitOk ? { ok: true } : { ok: false, retryAfterMs: 1000 },
    rateLimit: () => (state.rateLimitOk ? { ok: true } : { ok: false, retryAfterMs: 1000 }),
  }));

  mock.module("@/lib/realtime", () => {
    const record = (method: string) => (..._args: unknown[]) => {
      state.emits.push(method);
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
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
      wearPairCode: {
        deleteMany: async ({ where }: { where: { staffId: string; claimedAt: null } }) => {
          let count = 0;
          for (const [hash, row] of state.pairCodes) {
            if (row.staffId === where.staffId && row.claimedAt === null) {
              state.pairCodes.delete(hash);
              count += 1;
            }
          }
          return { count };
        },
        create: async ({ data }: { data: { staffId: string; codeHash: string; expiresAt: Date } }) => {
          const row: PairCodeRow = { id: `wpc_${++state.seq}`, claimedAt: null, ...data };
          state.pairCodes.set(data.codeHash, row);
          return row;
        },
        findUnique: async ({ where }: { where: { codeHash: string } }) =>
          state.pairCodes.get(where.codeHash) ?? null,
        updateMany: async ({ where, data }: { where: { id: string; claimedAt: null }; data: { claimedAt: Date } }) => {
          for (const row of state.pairCodes.values()) {
            if (row.id === where.id && row.claimedAt === null) {
              row.claimedAt = data.claimedAt;
              return { count: 1 };
            }
          }
          return { count: 0 };
        },
      },
      wearDevice: {
        create: async ({ data }: { data: { staffId: string; name: string; platform: string } }) => {
          const row: DeviceRow = {
            id: `dev_${++state.seq}`,
            fcmToken: null,
            tokenIssuedAt: new Date(),
            revokedAt: null,
            lastSeenAt: null,
            ...data,
          };
          state.devices.set(row.id, row);
          return row;
        },
        findUnique: async ({ where, include }: { where: { id: string }; include?: { staff?: unknown } }) => {
          const row = state.devices.get(where.id);
          if (!row) return null;
          if (include?.staff) {
            const staff = state.staff.get(row.staffId);
            return staff
              ? { ...row, staff: { id: staff.id, venueId: staff.venueId, name: staff.name, role: "SERVER", status: staff.status, sessionsValidAfter: staff.sessionsValidAfter } }
              : null;
          }
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<DeviceRow> }) => {
          const row = state.devices.get(where.id);
          if (!row) throw new Error("record not found");
          Object.assign(row, data);
          return row;
        },
        updateMany: async ({ data }: { where: unknown; data: Partial<DeviceRow> }) => {
          // lastSeenAt throttle write — apply loosely, count irrelevant.
          for (const row of state.devices.values()) Object.assign(row, data);
          return { count: state.devices.size };
        },
        findMany: async () => [...state.devices.values()],
      },
      staffMember: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const s = state.staff.get(where.id);
          if (!s) return null;
          return { ...s, venue: s.venue };
        },
      },
      request: {
        findUnique: async ({ where, include }: { where: { id: string }; include?: Record<string, unknown> }) => {
          const row = state.requests.get(where.id);
          return row ? shapeRequest(row, include) : null;
        },
        findMany: async ({ where, include }: {
          where: { venueId: string; status: { in: RequestStatus[] } };
          include?: Record<string, unknown>;
        }) => {
          return [...state.requests.values()]
            .filter(r => r.venueId === where.venueId && where.status.in.includes(r.status))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map(r => shapeRequest(r, include));
        },
        updateMany: async ({ where, data }: {
          where: { id: string; acknowledgedById?: null; status?: RequestStatus | { not: RequestStatus } };
          data: Partial<RequestRow>;
        }) => {
          const row = state.requests.get(where.id);
          if (!row) return { count: 0 };
          if (where.acknowledgedById === null && row.acknowledgedById !== null) return { count: 0 };
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
      },
    },
  }));
});

function jsonReq(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://tab-call.test${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Full phone→watch pairing round-trip; returns the device bearer token. */
async function pairAndClaim(): Promise<{ token: string; deviceId: string }> {
  const { POST: pair } = await import("../../app/api/wear/pair/route");
  const pairRes = await pair(jsonReq("/api/wear/pair", "POST"));
  expect(pairRes.status).toBe(200);
  const { code } = (await pairRes.json()) as { code: string };

  const { POST: claim } = await import("../../app/api/wear/claim/route");
  const claimRes = await claim(
    jsonReq("/api/wear/claim", "POST", { code, name: "Maya's Watch", platform: "wearos" }),
  );
  expect(claimRes.status).toBe(201);
  const body = (await claimRes.json()) as { token: string; device: { id: string } };
  return { token: body.token, deviceId: body.device.id };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("POST /api/wear/pair", () => {
  test("401 when no staff session", async () => {
    state.session = null;
    const { POST } = await import("../../app/api/wear/pair/route");
    const res = await POST(jsonReq("/api/wear/pair", "POST"));
    expect(res.status).toBe(401);
  });

  test("mints a 6-digit code and replaces unclaimed older codes", async () => {
    const { POST } = await import("../../app/api/wear/pair/route");
    const first = await POST(jsonReq("/api/wear/pair", "POST"));
    expect(first.status).toBe(200);
    const b1 = (await first.json()) as { code: string; ttlSeconds: number };
    expect(b1.code).toMatch(/^\d{6}$/);
    expect(b1.ttlSeconds).toBe(600);
    expect(state.pairCodes.size).toBe(1);

    await POST(jsonReq("/api/wear/pair", "POST"));
    expect(state.pairCodes.size).toBe(1); // old unclaimed code deleted
  });

  test("429 when rate limited", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/wear/pair/route");
    const res = await POST(jsonReq("/api/wear/pair", "POST"));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/wear/claim", () => {
  test("400 on malformed code", async () => {
    const { POST } = await import("../../app/api/wear/claim/route");
    const res = await POST(jsonReq("/api/wear/claim", "POST", { code: "12ab56" }));
    expect(res.status).toBe(400);
  });

  test("401 CODE_INVALID for unknown code", async () => {
    const { POST } = await import("../../app/api/wear/claim/route");
    const res = await POST(jsonReq("/api/wear/claim", "POST", { code: "000000" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("CODE_INVALID");
  });

  test("claim succeeds once, then the same code is dead (single-use)", async () => {
    const { POST: pair } = await import("../../app/api/wear/pair/route");
    const { code } = (await (await pair(jsonReq("/api/wear/pair", "POST"))).json()) as { code: string };

    const { POST: claim } = await import("../../app/api/wear/claim/route");
    const ok = await claim(jsonReq("/api/wear/claim", "POST", { code, name: "W1", platform: "watchos" }));
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { token: string; venue: { slug: string }; staff: { name: string } };
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.venue.slug).toBe("velvet-hour");
    expect(body.staff.name).toBe("Maya");

    const replay = await claim(jsonReq("/api/wear/claim", "POST", { code }));
    expect(replay.status).toBe(401);
  });

  test("expired code is refused with the same generic error", async () => {
    const { POST: pair } = await import("../../app/api/wear/pair/route");
    const { code } = (await (await pair(jsonReq("/api/wear/pair", "POST"))).json()) as { code: string };
    for (const row of state.pairCodes.values()) row.expiresAt = new Date(Date.now() - 1000);

    const { POST: claim } = await import("../../app/api/wear/claim/route");
    const res = await claim(jsonReq("/api/wear/claim", "POST", { code }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("CODE_INVALID");
  });
});

describe("GET /api/wear/queue", () => {
  test("401 without a bearer token", async () => {
    const { GET } = await import("../../app/api/wear/queue/route");
    const res = await GET(jsonReq("/api/wear/queue", "GET"));
    expect(res.status).toBe(401);
  });

  test("returns the venue's open requests with wrist-ready flags", async () => {
    const { token } = await pairAndClaim();
    const { GET } = await import("../../app/api/wear/queue/route");
    const res = await GET(jsonReq("/api/wear/queue", "GET", undefined, bearer(token)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pollAfterMs: number;
      staff: { name: string };
      requests: { id: string; table: string; assignedToMe: boolean; mine: boolean }[];
    };
    // Venue isolation: req_other_venue (v_b) must not appear.
    expect(body.requests.map(r => r.id)).toEqual(["req_1"]);
    expect(body.requests[0]!.table).toBe("Table 7");
    expect(body.requests[0]!.assignedToMe).toBe(true);
    expect(body.requests[0]!.mine).toBe(false);
    expect(body.staff.name).toBe("Maya");
    expect(body.pollAfterMs).toBe(5000); // PENDING present → fast pace
  });

  test("pacing relaxes when nothing is pending", async () => {
    const { token } = await pairAndClaim();
    const row = state.requests.get("req_1")!;
    row.status = "ACKNOWLEDGED" as RequestStatus;
    row.acknowledgedById = "stf_maya";

    const { GET } = await import("../../app/api/wear/queue/route");
    const body = (await (await GET(jsonReq("/api/wear/queue", "GET", undefined, bearer(token)))).json()) as {
      pollAfterMs: number;
      requests: { mine: boolean }[];
    };
    expect(body.pollAfterMs).toBe(20000);
    expect(body.requests[0]!.mine).toBe(true);
  });

  test("revoked device and rotated token are refused", async () => {
    const { token, deviceId } = await pairAndClaim();
    const { GET } = await import("../../app/api/wear/queue/route");

    state.devices.get(deviceId)!.revokedAt = new Date();
    const revoked = await GET(jsonReq("/api/wear/queue", "GET", undefined, bearer(token)));
    expect(revoked.status).toBe(401);
    expect(((await revoked.json()) as { error: string }).error).toBe("DEVICE_REVOKED");

    state.devices.get(deviceId)!.revokedAt = null;
    state.devices.get(deviceId)!.tokenIssuedAt = new Date(Date.now() + 60_000); // re-paired later
    const rotated = await GET(jsonReq("/api/wear/queue", "GET", undefined, bearer(token)));
    expect(rotated.status).toBe(401);
    expect(((await rotated.json()) as { error: string }).error).toBe("TOKEN_ROTATED");
  });

  test("suspended staff is cut off with 403 STAFF_INACTIVE", async () => {
    const { token } = await pairAndClaim();
    state.staff.get("stf_maya")!.status = "SUSPENDED" as StaffStatus;
    const { GET } = await import("../../app/api/wear/queue/route");
    const res = await GET(jsonReq("/api/wear/queue", "GET", undefined, bearer(token)));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("STAFF_INACTIVE");
  });
});

describe("POST /api/wear/requests/[id]/ack + resolve", () => {
  test("ack flips PENDING → ACKNOWLEDGED and emits realtime", async () => {
    const { token } = await pairAndClaim();
    const { POST } = await import("../../app/api/wear/requests/[id]/ack/route");
    const res = await POST(
      jsonReq("/api/wear/requests/req_1/ack", "POST", undefined, bearer(token)),
      { params: { id: "req_1" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mine: boolean; ackedBy: string | null; alreadyAcked: boolean };
    expect(body.mine).toBe(true);
    expect(body.ackedBy).toBe("Maya");
    expect(body.alreadyAcked).toBe(false);
    expect(state.requests.get("req_1")!.status).toBe("ACKNOWLEDGED");
    expect(state.emits).toContain("requestAcknowledged");
  });

  test("racing a colleague reports alreadyAcked with their name, not an error", async () => {
    const { token } = await pairAndClaim();
    const row = state.requests.get("req_1")!;
    row.status = "ACKNOWLEDGED" as RequestStatus;
    row.acknowledgedById = "stf_dee";

    const { POST } = await import("../../app/api/wear/requests/[id]/ack/route");
    const res = await POST(
      jsonReq("/api/wear/requests/req_1/ack", "POST", undefined, bearer(token)),
      { params: { id: "req_1" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyAcked: boolean; ackedBy: string | null; mine: boolean };
    expect(body.alreadyAcked).toBe(true);
    expect(body.ackedBy).toBe("Dee");
    expect(body.mine).toBe(false);
  });

  test("cannot touch another venue's request (403)", async () => {
    const { token } = await pairAndClaim();
    const { POST } = await import("../../app/api/wear/requests/[id]/ack/route");
    const res = await POST(
      jsonReq("/api/wear/requests/req_other_venue/ack", "POST", undefined, bearer(token)),
      { params: { id: "req_other_venue" } },
    );
    expect(res.status).toBe(403);
  });

  test("resolve requires an action, then is idempotent", async () => {
    const { token } = await pairAndClaim();
    const { POST } = await import("../../app/api/wear/requests/[id]/resolve/route");

    const missing = await POST(
      jsonReq("/api/wear/requests/req_1/resolve", "POST", {}, bearer(token)),
      { params: { id: "req_1" } },
    );
    expect(missing.status).toBe(400);

    const ok = await POST(
      jsonReq("/api/wear/requests/req_1/resolve", "POST", { action: "SERVED" }, bearer(token)),
      { params: { id: "req_1" } },
    );
    expect(ok.status).toBe(200);
    expect(state.requests.get("req_1")!.status).toBe("RESOLVED");
    expect(state.requests.get("req_1")!.resolutionAction).toBe("SERVED");
    expect(state.emits).toContain("requestResolved");

    const again = await POST(
      jsonReq("/api/wear/requests/req_1/resolve", "POST", { action: "COMPED" }, bearer(token)),
      { params: { id: "req_1" } },
    );
    expect(again.status).toBe(200);
    const body = (await again.json()) as { alreadyResolved: boolean; resolutionAction: string };
    expect(body.alreadyResolved).toBe(true);
    // Original action untouched.
    expect(state.requests.get("req_1")!.resolutionAction).toBe("SERVED");
  });
});
