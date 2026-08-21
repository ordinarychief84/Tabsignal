/**
 * The floor signal vocabulary.
 *
 * Two properties worth pinning. Every RequestType a guest can send has a
 * staff-facing label — an unlabelled signal renders as a raw enum name on
 * someone's phone mid-service. And the guest sheet only offers types the
 * API will actually accept, so a tap can't 400.
 */

import { describe, expect, test } from "bun:test";
import { SERVICE_OPTIONS } from "@/components/guest/service-sheet";

/** Mirrors prisma's RequestType. Update both together, deliberately. */
const REQUEST_TYPES = [
  "DRINK", "BILL", "HELP", "REFILL", "ORDER", "CELEBRATION", "CLEAN", "SUPPLIES",
] as const;

describe("guest service options", () => {
  test("every option maps to a real request type", () => {
    for (const option of SERVICE_OPTIONS) {
      expect(REQUEST_TYPES).toContain(option.type);
    }
  });

  test("option ids are unique — they key the React list", () => {
    const ids = SERVICE_OPTIONS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every option has a label and an emoji", () => {
    for (const option of SERVICE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.emoji.length).toBeGreaterThan(0);
    }
  });

  test("covers the six things a guest actually needs", () => {
    const types = new Set(SERVICE_OPTIONS.map(o => o.type));
    // Come by, water, ready to order, the check, celebrating, plus the
    // two a runner can take.
    for (const t of ["HELP", "REFILL", "ORDER", "BILL", "CELEBRATION", "CLEAN", "SUPPLIES"]) {
      expect(types.has(t as never)).toBe(true);
    }
  });

  test("'ready for the check' is a signal, not a payment", () => {
    const check = SERVICE_OPTIONS.find(o => o.id === "check");
    expect(check?.type).toBe("BILL");
    // The wording tells the server what to do; TabCall never holds money.
    expect(check?.label.toLowerCase()).toContain("check");
    expect(check?.label.toLowerCase()).not.toContain("pay");
  });

  test("no option offers to place an order", () => {
    // "Ready to order" brings the server over. It submits nothing.
    for (const option of SERVICE_OPTIONS) {
      expect(option.label.toLowerCase()).not.toContain("place order");
      expect(option.label.toLowerCase()).not.toContain("submit");
    }
  });
});
