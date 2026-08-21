/**
 * Tests for the staff multi-call detection helper.
 *
 * Multi-call cue = banner + chime in the staff queue when a waiter
 * has open requests on 2+ of their assigned tables simultaneously.
 */

import { describe, expect, test } from "bun:test";
import { computeMultiCall, formatAge, type MultiCallItem } from "../staff/multi-call";

const NOW = 1_700_000_000_000; // fixed clock for stable tests

function req(
  partial: Partial<MultiCallItem> & { id: string; tableId: string },
): MultiCallItem {
  return {
    tableLabel: `Table ${partial.tableId}`,
    type: "DRINK",
    status: "PENDING",
    createdAt: new Date(NOW - 30_000).toISOString(),
    ...partial,
  };
}

describe("computeMultiCall", () => {
  test("empty items → count 0", () => {
    const r = computeMultiCall([], new Set(), NOW);
    expect(r.count).toBe(0);
    expect(r.tables).toEqual([]);
  });

  test("single open request on one assigned table → count 1 (no cue)", () => {
    const items = [req({ id: "r1", tableId: "t4" })];
    const r = computeMultiCall(items, new Set(["t4"]), NOW);
    expect(r.count).toBe(1);
    expect(r.tables[0].tableId).toBe("t4");
  });

  test("two distinct tables calling → count 2 (cue threshold)", () => {
    const items = [
      req({ id: "r1", tableId: "t4" }),
      req({ id: "r2", tableId: "t7" }),
    ];
    const r = computeMultiCall(items, new Set(["t4", "t7"]), NOW);
    expect(r.count).toBe(2);
    expect(r.tables.map(t => t.tableId).sort()).toEqual(["t4", "t7"]);
  });

  test("two requests on the SAME table = count 1 (not multi)", () => {
    const items = [
      req({ id: "r1", tableId: "t4" }),
      req({ id: "r2", tableId: "t4", type: "BILL" }),
    ];
    const r = computeMultiCall(items, new Set(["t4"]), NOW);
    expect(r.count).toBe(1);
    expect(r.tables[0].openCount).toBe(2);
  });

  test("ignores tables the waiter isn't assigned to", () => {
    const items = [
      req({ id: "r1", tableId: "t4" }),
      req({ id: "r2", tableId: "t99" }), // not in assigned set
    ];
    const r = computeMultiCall(items, new Set(["t4"]), NOW);
    expect(r.count).toBe(1);
    expect(r.tables[0].tableId).toBe("t4");
  });

  test("ignores ACKNOWLEDGED + RESOLVED requests", () => {
    const items = [
      req({ id: "r1", tableId: "t4", status: "ACKNOWLEDGED" }),
      req({ id: "r2", tableId: "t7", status: "RESOLVED" }),
      req({ id: "r3", tableId: "t12", status: "PENDING" }),
    ];
    const r = computeMultiCall(items, new Set(["t4", "t7", "t12"]), NOW);
    // Only t12 is "calling".
    expect(r.count).toBe(1);
    expect(r.tables[0].tableId).toBe("t12");
  });

  test("ESCALATED requests count as open", () => {
    const items = [
      req({ id: "r1", tableId: "t4", status: "ESCALATED" }),
      req({ id: "r2", tableId: "t7", status: "PENDING" }),
    ];
    const r = computeMultiCall(items, new Set(["t4", "t7"]), NOW);
    expect(r.count).toBe(2);
  });

  test("sorts oldest-first so the longest-waiting table reads at the top", () => {
    const items = [
      req({ id: "newest", tableId: "t12", createdAt: new Date(NOW - 5_000).toISOString() }),
      req({ id: "oldest", tableId: "t4",  createdAt: new Date(NOW - 90_000).toISOString() }),
      req({ id: "middle", tableId: "t7",  createdAt: new Date(NOW - 40_000).toISOString() }),
    ];
    const r = computeMultiCall(items, new Set(["t4", "t7", "t12"]), NOW);
    expect(r.tables.map(t => t.tableId)).toEqual(["t4", "t7", "t12"]);
    expect(r.tables[0].oldestAgeMs).toBe(90_000);
    expect(r.tables[1].oldestAgeMs).toBe(40_000);
    expect(r.tables[2].oldestAgeMs).toBe(5_000);
  });

  test("oldest-request-per-table is picked when one table has multiple open requests", () => {
    const items = [
      req({ id: "drink-newer", tableId: "t4", type: "DRINK", createdAt: new Date(NOW - 10_000).toISOString() }),
      req({ id: "bill-older",  tableId: "t4", type: "BILL",  createdAt: new Date(NOW - 60_000).toISOString() }),
      req({ id: "r2",          tableId: "t7" }),
    ];
    const r = computeMultiCall(items, new Set(["t4", "t7"]), NOW);
    expect(r.count).toBe(2);
    const t4 = r.tables.find(t => t.tableId === "t4")!;
    expect(t4.oldestRequestId).toBe("bill-older");
    expect(t4.oldestRequestType).toBe("BILL");
    expect(t4.openCount).toBe(2);
  });

  test("skips items without a tableId (venue-wide alerts don't qualify)", () => {
    const items = [
      req({ id: "r1", tableId: "t4" }),
      // Synthesise an entry with no tableId by erasing it after the helper.
      { ...req({ id: "r2", tableId: "x" }), tableId: undefined },
    ];
    const r = computeMultiCall(items, new Set(["t4"]), NOW);
    expect(r.count).toBe(1);
  });
});

describe("formatAge", () => {
  test("seconds-only when under a minute", () => {
    expect(formatAge(0)).toBe("0s");
    expect(formatAge(7_000)).toBe("7s");
    expect(formatAge(59_999)).toBe("59s");
  });
  test("minutes + zero-padded seconds when >= 60s", () => {
    expect(formatAge(60_000)).toBe("1m 00s");
    expect(formatAge(72_000)).toBe("1m 12s");
    expect(formatAge(3_607_000)).toBe("60m 07s");
  });
  test("negative inputs clamp to 0s", () => {
    expect(formatAge(-500)).toBe("0s");
  });
});
