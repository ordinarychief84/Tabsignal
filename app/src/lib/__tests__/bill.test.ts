/**
 * Tab total math. Since guest payments were removed there is exactly one
 * number — the sum of the line items — so these guard that it stays a
 * plain sum and, importantly, that no tax or tip concept comes back in
 * through a side door.
 */

import { describe, expect, test } from "bun:test";
import { dollars, parseLineItems, totalsFor, type LineItem } from "../bill";

describe("totalsFor", () => {
  test("zero items → all zero", () => {
    expect(totalsFor([])).toEqual({ subtotalCents: 0, totalCents: 0 });
  });

  test("total equals subtotal — nothing is added on top", () => {
    // The regression this exists to catch: TabCall does not charge guests,
    // so it must never quietly add tax or a service fee to a displayed tab.
    const items: LineItem[] = [{ name: "Old Fashioned", quantity: 1, unitCents: 1000 }];
    const t = totalsFor(items);
    expect(t.subtotalCents).toBe(1000);
    expect(t.totalCents).toBe(1000);
  });

  test("multi-item subtotal", () => {
    const items: LineItem[] = [
      { name: "Beer", quantity: 4, unitCents: 700 },
      { name: "Wing basket", quantity: 1, unitCents: 1450 },
    ];
    expect(totalsFor(items).totalCents).toBe(4250);
  });

  test("negative line item (comp) reduces the total", () => {
    const items: LineItem[] = [
      { name: "Drink", quantity: 1, unitCents: 1500 },
      { name: "Comp", quantity: 1, unitCents: -500 },
    ];
    expect(totalsFor(items).totalCents).toBe(1000);
  });

  test("a venue's location no longer changes the number", () => {
    // Totals used to vary by ZIP via a Texas-only sales-tax table. They
    // don't any more, and this pins that: a tab is the same everywhere.
    const items: LineItem[] = [{ name: "X", quantity: 1, unitCents: 1000 }];
    expect(totalsFor(items).totalCents).toBe(1000);
  });
});

describe("parseLineItems", () => {
  test("junk collapses to an empty ledger rather than throwing", () => {
    for (const raw of [null, undefined, 42, "nope", {}, [{ bad: true }]]) {
      expect(parseLineItems(raw)).toEqual([]);
    }
  });

  test("valid items round-trip", () => {
    const items = [{ name: "IPA", quantity: 2, unitCents: 800 }];
    expect(parseLineItems(items)).toEqual(items);
  });
});

describe("dollars", () => {
  test("formats cents, using a true minus sign for negatives", () => {
    expect(dollars(0)).toBe("$0.00");
    expect(dollars(1250)).toBe("$12.50");
    expect(dollars(-500)).toBe("−$5.00");
  });
});
