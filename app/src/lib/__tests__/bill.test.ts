/**
 * Unit tests for the bill total math. These guard the money path —
 * any change to subtotal/tax/tip/total semantics needs to keep these
 * green. Run with `bun test` (Bun's jest-compatible runner).
 */

import { describe, expect, test } from "bun:test";
import { dollars, parseLineItems, totalsFor, totalsForCharge, type LineItem } from "../bill";

// The tax slice of a Venue row that totalsFor/totalsForCharge consume.
const HOUSTON = { zipCode: "77006", taxRateBps: null }; // Texas ZIP fallback → 8.25%
const NO_TAX_INFO = { zipCode: "90210", taxRateBps: null }; // outside TX, nothing set

describe("totalsFor", () => {
  test("zero items → all zero", () => {
    const t = totalsFor([], HOUSTON, 20);
    expect(t).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
    });
  });

  test("single $10 item, 20% tip, Houston tax", () => {
    const items: LineItem[] = [{ name: "Old Fashioned", quantity: 1, unitCents: 1000 }];
    const t = totalsFor(items, HOUSTON, 20);
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
    const t = totalsFor(items, HOUSTON, 0);
    expect(t.subtotalCents).toBe(4250);
    expect(t.tipCents).toBe(0);
  });

  test("tip clamped to [0, 50]", () => {
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    const negTip = totalsFor(items, HOUSTON, -25);
    expect(negTip.tipCents).toBe(0);
    const huge = totalsFor(items, HOUSTON, 999);
    expect(huge.tipCents).toBe(500); // clamped at 50%
  });

  test("unknown rate displays as 0% tax (display path only)", () => {
    // totalsFor backs dashboards and exports, so an unresolvable rate must
    // not throw. The CHARGE path refuses instead — see totalsForCharge.
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    const t = totalsFor(items, NO_TAX_INFO, 18);
    expect(t.taxCents).toBe(0);
  });

  test("explicit venue rate overrides the ZIP fallback", () => {
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    // A Houston venue that actually files 6.25% must not be forced to 8.25%.
    const t = totalsFor(items, { zipCode: "77006", taxRateBps: 625 }, 0);
    expect(t.taxCents).toBe(63); // round(1000 * 0.0625)
  });

  test("explicit zero rate is honored, not treated as unset", () => {
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    // Portland OR: genuinely no sales tax. Must resolve, not fall through.
    const t = totalsForCharge(items, { zipCode: "97205", taxRateBps: 0 }, 0);
    expect(t.ok).toBe(true);
    if (t.ok) expect(t.totals.taxCents).toBe(0);
  });
});

describe("totalsForCharge", () => {
  test("refuses when the venue has no resolvable tax rate", () => {
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    const t = totalsForCharge(items, NO_TAX_INFO, 20);
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toBe("TAX_RATE_UNSET");
  });

  test("matches totalsFor when a rate resolves", () => {
    const items: LineItem[] = [{ name: "Old Fashioned", quantity: 1, unitCents: 1000 }];
    const charge = totalsForCharge(items, HOUSTON, 20);
    expect(charge.ok).toBe(true);
    if (charge.ok) expect(charge.totals).toEqual(totalsFor(items, HOUSTON, 20));
  });

  test("negative line item (comp) reduces subtotal", () => {
    const items: LineItem[] = [
      { name: "Drink", quantity: 1, unitCents: 1500 },
      { name: "Comp", quantity: 1, unitCents: -500 },
    ];
    const t = totalsFor(items, HOUSTON, 20);
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
