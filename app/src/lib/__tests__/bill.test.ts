/**
 * Unit tests for the bill total math. These guard the money path —
 * any change to subtotal/tax/tip/total semantics needs to keep these
 * green. Run with `bun test` (Bun's jest-compatible runner).
 */

import { describe, expect, test } from "bun:test";
import { dollars, parseLineItems, totalsFor, type LineItem } from "../bill";

const HOUSTON_ZIP = "77006"; // matches taxRateForZip Texas branch

describe("totalsFor", () => {
  test("zero items → all zero", () => {
    const t = totalsFor([], HOUSTON_ZIP, 20);
    expect(t).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
    });
  });

  test("single $10 item, 20% tip, Houston tax", () => {
    const items: LineItem[] = [{ name: "Old Fashioned", quantity: 1, unitCents: 1000 }];
    const t = totalsFor(items, HOUSTON_ZIP, 20);
    expect(t.subtotalCents).toBe(1000);
    // Texas state sales tax is 8.25% per the lib/tax.ts table; if the rate
    // ever changes, update this expectation deliberately rather than the
    // production math chasing the test.
    expect(t.taxCents).toBe(83); // round(1000 * 0.0825)
    expect(t.tipCents).toBe(200); // round(1000 * 0.20)
    expect(t.totalCents).toBe(1283);
  });

  test("multi-item subtotal", () => {
    const items: LineItem[] = [
      { name: "Beer", quantity: 4, unitCents: 700 },     // 2800
      { name: "Wing basket", quantity: 1, unitCents: 1450 }, // 1450
    ];
    const t = totalsFor(items, HOUSTON_ZIP, 0);
    expect(t.subtotalCents).toBe(4250);
    expect(t.tipCents).toBe(0);
  });

  test("tip clamped to [0, 50]", () => {
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    const negTip = totalsFor(items, HOUSTON_ZIP, -25);
    expect(negTip.tipCents).toBe(0);
    const huge = totalsFor(items, HOUSTON_ZIP, 999);
    expect(huge.tipCents).toBe(500); // clamped at 50%
  });

  test("zero tax for non-Texas zip (current behaviour)", () => {
    // taxRateForZip returns 0 for unknown zips; surfacing that here so a
    // future refactor that adds CA tax (etc.) breaks this test loudly.
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    const t = totalsFor(items, "90210", 18);
    expect(t.taxCents).toBe(0);
  });

  test("negative line item (comp) reduces subtotal", () => {
    const items: LineItem[] = [
      { name: "Drink", quantity: 1, unitCents: 1500 },
      { name: "Comp", quantity: 1, unitCents: -500 },
    ];
    const t = totalsFor(items, HOUSTON_ZIP, 20);
    expect(t.subtotalCents).toBe(1000);
    // Tip is computed off the post-comp subtotal — comp reduces tip too.
    expect(t.tipCents).toBe(200);
  });
});

describe("dollars formatting", () => {
  test("positive cents", () => {
    expect(dollars(0)).toBe("$0.00");
    expect(dollars(1)).toBe("$0.01");
    expect(dollars(100)).toBe("$1.00");
    expect(dollars(123456)).toBe("$1234.56");
  });

  test("negative renders with true minus sign, not $-X", () => {
    expect(dollars(-100)).toBe("−$1.00");
    expect(dollars(-1)).toBe("−$0.01");
    // Important UX choice: minus-then-dollar reads cleanly in receipts.
    expect(dollars(-100).startsWith("$-")).toBe(false);
  });
});

describe("parseLineItems", () => {
  test("returns [] for non-array input", () => {
    expect(parseLineItems(null)).toEqual([]);
    expect(parseLineItems(undefined)).toEqual([]);
    expect(parseLineItems("hello")).toEqual([]);
    expect(parseLineItems({ name: "X" })).toEqual([]);
  });

  test("filters invalid items via Zod (whole array rejected on bad row)", () => {
    // Today the schema is array-level (one bad row → whole input dropped).
    // Capturing that contract so a future change to per-row filtering is
    // a deliberate choice with a test update.
    const out = parseLineItems([
      { name: "Beer", quantity: 1, unitCents: 700 },
      { name: "Bad", quantity: 0, unitCents: 100 }, // quantity must be positive
    ]);
    expect(out).toEqual([]);
  });

  test("accepts well-formed items", () => {
    const items = [
      { name: "Beer", quantity: 1, unitCents: 700 },
      { name: "Comp", quantity: 1, unitCents: -200 },
    ];
    expect(parseLineItems(items)).toEqual(items);
  });
});
