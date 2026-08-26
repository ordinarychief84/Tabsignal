/**
 * markOnMyWay — the transition that earns the guest-facing promise.
 *
 * Before this existed the lifecycle was PENDING → ACKNOWLEDGED →
 * RESOLVED, and the guest app read ACKNOWLEDGED as "Sarah is on the
 * way". A server carrying three plates who taps Got it has SEEN the
 * request; they are not crossing the room. The guest, told otherwise,
 * stops watching the door and waits longer before asking again — so the
 * feature that was supposed to speed service was slowing it.
 *
 * The rules worth defending here:
 *
 *   - you cannot say you're coming for a request nobody has claimed
 *   - you cannot say it for SOMEONE ELSE'S request; that is how two
 *     servers end up walking to the same table while a third goes
 *     unserved
 *   - pressing it twice is a no-op, not a second timestamp, because a
 *     double-tap on a phone in a loud room is expected input
 *   - acknowledgedAt is never overwritten; the gap between the two
 *     stamps is the only evidence that a request was claimed and then
 *     sat on
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Row = {
  id: string;
  venueId: string;
  sessionId: string;
  status: string;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  onMyWayAt: Date | null;
  type: string;
  table: { label: string };
  acknowledgedBy?: { displayName: string | null; name: string } | null;
};

const state: {
  row: Row | null;
  updates: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  emitted: { event: string; payload: unknown }[];
} = { row: null, updates: [], emitted: [] };

const ACTOR = { staffId: "staff_1", venueId: "venue_1" };

function baseRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "req_1",
    venueId: "venue_1",
    sessionId: "gs_1",
    status: "ACKNOWLEDGED",
    acknowledgedById: "staff_1",
    acknowledgedAt: new Date("2026-08-27T19:00:00.000Z"),
    onMyWayAt: null,
    type: "REFILL",
    table: { label: "Table 7" },
    acknowledgedBy: { displayName: "Sarah", name: "Sarah Okonkwo" },
    ...overrides,
  };
}

beforeEach(() => {
  state.row = baseRow();
  state.updates = [];
  state.emitted = [];

  mock.module("@/lib/db", () => ({
    db: {
      request: {
        findUnique: async () => state.row,
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          state.updates.push(args);
          const w = args.where as { status?: string; acknowledgedById?: string };
          const r = state.row!;
          const matches =
            (w.status === undefined || r.status === w.status) &&
            (w.acknowledgedById === undefined || r.acknowledgedById === w.acknowledgedById);
          if (!matches) return { count: 0 };
          state.row = { ...r, status: "ON_MY_WAY", onMyWayAt: new Date() };
          return { count: 1 };
        },
      },
    },
  }));

  mock.module("@/lib/realtime", () => ({
    emit: async () => undefined,
    events: {
      newRequest: async () => undefined,
      requestAcknowledged: async () => undefined,
      requestOnMyWay: async (_v: string, _s: string, payload: unknown) => {
        state.emitted.push({ event: "request_on_my_way", payload });
      },
      requestResolved: async () => undefined,
      requestEscalated: async () => undefined,
      orderPlaced: async () => undefined,
      orderStatusChanged: async () => undefined,
      regularArrived: async () => undefined,
    },
  }));
});

afterEach(() => {
  mock.restore();
});

describe("markOnMyWay", () => {
  test("moves a request this server acknowledged", async () => {
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    const res = await markOnMyWay(ACTOR, "req_1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyOnMyWay).toBe(false);
    expect(res.request.status).toBe("ON_MY_WAY");
    expect(res.request.onMyWayAt).not.toBeNull();
  });

  test("never overwrites acknowledgedAt", async () => {
    // The gap between the two stamps is the only evidence that a request
    // was claimed and then sat on. Collapsing them destroys it.
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    await markOnMyWay(ACTOR, "req_1");
    for (const u of state.updates) {
      expect(Object.keys(u.data)).not.toContain("acknowledgedAt");
      expect(Object.keys(u.data)).not.toContain("acknowledgedById");
    }
    expect(state.row!.acknowledgedAt?.toISOString()).toBe("2026-08-27T19:00:00.000Z");
  });

  test("refuses a request nobody has claimed", async () => {
    state.row = baseRow({ status: "PENDING", acknowledgedById: null, acknowledgedAt: null });
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    const res = await markOnMyWay(ACTOR, "req_1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("NOT_ACKNOWLEDGED");
    expect(state.updates).toEqual([]);
  });

  test("refuses another server's request", async () => {
    // Two servers walking to the same table is worse than one walking
    // late. Taking it over is a handoff, which logs the change.
    state.row = baseRow({ acknowledgedById: "staff_2" });
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    const res = await markOnMyWay(ACTOR, "req_1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("FORBIDDEN");
    expect(state.updates).toEqual([]);
  });

  test("refuses a request at another venue", async () => {
    state.row = baseRow({ venueId: "venue_2" });
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    const res = await markOnMyWay(ACTOR, "req_1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("FORBIDDEN");
  });

  test("refuses an already-resolved request", async () => {
    state.row = baseRow({ status: "RESOLVED" });
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    const res = await markOnMyWay(ACTOR, "req_1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("ALREADY_RESOLVED");
  });

  test("a missing request is NOT_FOUND", async () => {
    state.row = null;
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    const res = await markOnMyWay(ACTOR, "nope");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("NOT_FOUND");
  });

  test("pressing it twice is a no-op, not a second timestamp", async () => {
    const stamp = new Date("2026-08-27T19:01:00.000Z");
    state.row = baseRow({ status: "ON_MY_WAY", onMyWayAt: stamp });
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    const res = await markOnMyWay(ACTOR, "req_1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyOnMyWay).toBe(true);
    expect(res.request.onMyWayAt).toBe(stamp.toISOString());
    expect(state.updates).toEqual([]);
  });

  test("writes through a compare-and-swap, not a blind update", async () => {
    // Two taps racing each other must produce one stamp.
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    await markOnMyWay(ACTOR, "req_1");
    expect(state.updates.length).toBe(1);
    expect(state.updates[0]!.where).toMatchObject({
      status: "ACKNOWLEDGED",
      acknowledgedById: "staff_1",
    });
  });
});

describe("what the guest is told", () => {
  test("an event reaches the guest, carrying the server's display name", async () => {
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    await markOnMyWay(ACTOR, "req_1");
    expect(state.emitted.length).toBe(1);
    const payload = state.emitted[0]!.payload as Record<string, unknown>;
    expect(payload.status).toBe("ON_MY_WAY");
    // displayName, not name: `name` can be a legal name and does not
    // belong on a stranger's phone.
    expect(payload.serverName).toBe("Sarah");
  });

  test("the payload carries nothing private", async () => {
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    await markOnMyWay(ACTOR, "req_1");
    const serialized = JSON.stringify(state.emitted[0]!.payload);
    // No legal name, no staff id, no session token, no email.
    expect(serialized).not.toContain("Okonkwo");
    expect(serialized).not.toContain("staff_1");
    expect(serialized).not.toContain("gs_1");
  });

  test("nothing is emitted when the transition was refused", async () => {
    // A guest told somebody is coming when the write failed is worse
    // than a guest told nothing.
    state.row = baseRow({ acknowledgedById: "staff_2" });
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    await markOnMyWay(ACTOR, "req_1");
    expect(state.emitted).toEqual([]);
  });

  test("nothing is emitted on a repeat press", async () => {
    // Otherwise a double-tap re-announces arrival the guest already saw.
    state.row = baseRow({ status: "ON_MY_WAY", onMyWayAt: new Date() });
    const { markOnMyWay } = await import("../../domain/requests/lifecycle");
    await markOnMyWay(ACTOR, "req_1");
    expect(state.emitted).toEqual([]);
  });
});
