/**
 * domain/billing/tab — the Phase 1 extraction that funnels every tab
 * read/mutation through one module (restructure plan, PR 1.1).
 *
 * These tests pin the semantics the extraction must preserve verbatim:
 *   - guestBillFor returns the exact /api/session/[id]/bill shape
 *   - addItems error precedence + append/replace behavior
 *   - appendTabLine RAW-append (marker fields on existing items survive;
 *     the loyalty path depends on this) + extraData single-write merge
 *   - appendComp parse-then-append (comp-route semantics)
 *   - spendForSession parity with the legacy regulars formula
 *     (no nonnegative floor — comp-heavy tabs may net negative)
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

type SessionRow = {
  id: string;
  venueId: string;
  lineItems: unknown;
  paidAt: Date | null;
  expiresAt: Date;
  guestProfileId?: string | null;
};

type StubState = {
  sessions: Map<string, SessionRow>;
  updates: { where: { id: string }; data: Record<string, unknown> }[];
};

let state: StubState;

beforeEach(() => {
  state = {
    sessions: new Map([
      ["gs_1", {
        id: "gs_1",
        venueId: "v_a",
        lineItems: [{ name: "Margarita", quantity: 2, unitCents: 1200 }],
        paidAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        guestProfileId: null,
      }],
    ]),
    updates: [],
  };

  mock.module("@/lib/db", () => ({
    db: {
      guestSession: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          state.sessions.get(where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = state.sessions.get(where.id);
          if (!row) throw new Error("record not found");
          state.updates.push({ where, data });
          Object.assign(row, data);
          return row;
        },
      },
    },
  }));
});

describe("guestBillFor", () => {
  test("returns the exact bill-route response shape with default 20% tip", async () => {
    const { guestBillFor } = await import("../../domain/billing/tab");
    const bill = guestBillFor({
      id: "gs_1",
      lineItems: [{ name: "IPA", quantity: 2, unitCents: 800 }],
      venue: { name: "Velvet Hour", zipCode: "78701" },
      table: { label: "T7" },
    });
    // Key ORDER is part of the pinned contract (byte-identical JSON).
    expect(Object.keys(bill)).toEqual([
      "sessionId", "venueName", "tableLabel", "items", "defaultTipPercent", "totals",
    ]);
    expect(bill.defaultTipPercent).toBe(20);
    expect(bill.items).toEqual([{ name: "IPA", quantity: 2, unitCents: 800 }]);
    expect(bill.totals.subtotalCents).toBe(1600);
    expect(bill.totals.totalCents).toBeGreaterThan(1600); // tax + tip applied
  });
});

describe("addItems", () => {
  test("error precedence: not found → forbidden → paid → expired", async () => {
    const { addItems } = await import("../../domain/billing/tab");
    const item = [{ name: "Fries", quantity: 1, unitCents: 950 }];

    expect((await addItems("nope", "v_a", item, "append"))).toEqual({ ok: false, error: "SESSION_NOT_FOUND" });
    expect((await addItems("gs_1", "v_other", item, "append"))).toEqual({ ok: false, error: "FORBIDDEN" });

    state.sessions.get("gs_1")!.paidAt = new Date();
    expect((await addItems("gs_1", "v_a", item, "append"))).toEqual({ ok: false, error: "ALREADY_PAID" });

    state.sessions.get("gs_1")!.paidAt = null;
    state.sessions.get("gs_1")!.expiresAt = new Date(Date.now() - 1000);
    expect((await addItems("gs_1", "v_a", item, "append"))).toEqual({ ok: false, error: "SESSION_EXPIRED" });
  });

  test("append extends, replace overwrites", async () => {
    const { addItems } = await import("../../domain/billing/tab");
    const appended = await addItems("gs_1", "v_a", [{ name: "Fries", quantity: 1, unitCents: 950 }], "append");
    expect(appended.ok && appended.items.map(i => i.name)).toEqual(["Margarita", "Fries"]);

    const replaced = await addItems("gs_1", "v_a", [{ name: "Water", quantity: 1, unitCents: 0 }], "replace");
    expect(replaced.ok && replaced.items).toEqual([{ name: "Water", quantity: 1, unitCents: 0 }]);
  });
});

describe("appendTabLine", () => {
  test("raw append preserves marker fields on existing items and merges extraData in ONE update", async () => {
    const { appendTabLine } = await import("../../domain/billing/tab");
    const { db } = await import("@/lib/db");
    const session = state.sessions.get("gs_1")!;
    // Simulate a prior loyalty redemption with a marker field.
    session.lineItems = [
      { name: "Margarita", quantity: 2, unitCents: 1200 },
      { name: "Loyalty redemption (40 pts)", quantity: 1, unitCents: -200, isLoyaltyDiscount: true },
    ];

    await appendTabLine(
      db as never,
      session,
      { name: "Loyalty redemption (20 pts)", quantity: 1, unitCents: -100, isLoyaltyDiscount: true },
      { guestProfileId: "prof_1" },
    );

    expect(state.updates.length).toBe(1); // single write — atomicity contract
    const written = state.updates[0]!.data;
    expect(written.guestProfileId).toBe("prof_1");
    const items = written.lineItems as Record<string, unknown>[];
    expect(items.length).toBe(3);
    // The pre-existing marker survived (raw append, no schema strip).
    expect(items[1]!.isLoyaltyDiscount).toBe(true);
    expect(items[2]!.isLoyaltyDiscount).toBe(true);
  });

  test("junk existing lineItems is replaced by [] (defensive parity)", async () => {
    const { appendTabLine } = await import("../../domain/billing/tab");
    const { db } = await import("@/lib/db");
    const session = state.sessions.get("gs_1")!;
    session.lineItems = "corrupted";

    await appendTabLine(db as never, session, { name: "Beer", quantity: 1, unitCents: 700 });
    const items = state.updates[0]!.data.lineItems as unknown[];
    expect(items).toEqual([{ name: "Beer", quantity: 1, unitCents: 700 }]);
  });
});

describe("appendComp", () => {
  test("appends a negative, schema-parsed comp item", async () => {
    const { appendComp } = await import("../../domain/billing/tab");
    const session = state.sessions.get("gs_1")!;
    const item = await appendComp(session, 1500);
    expect(item).toEqual({ name: "Comp · manager apology", quantity: 1, unitCents: -1500 });
    const written = state.updates[0]!.data.lineItems as unknown[];
    expect(written.length).toBe(2);
    expect(written[1]).toEqual(item);
  });
});

describe("spendForSession", () => {
  test("matches the legacy regulars formula — raw sum, negatives allowed, junk → 0", async () => {
    const { spendForSession } = await import("../../domain/billing/tab");
    expect(spendForSession([{ name: "A", quantity: 2, unitCents: 1000 }])).toBe(2000);
    expect(
      spendForSession([
        { name: "A", quantity: 1, unitCents: 1000 },
        { name: "Comp", quantity: 1, unitCents: -2500 },
      ]),
    ).toBe(-1500); // no floor — parity with the pre-extraction rollup
    expect(spendForSession(null)).toBe(0);
    expect(spendForSession("garbage")).toBe(0);
  });
});
