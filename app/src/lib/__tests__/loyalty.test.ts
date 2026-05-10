/**
 * Unit tests for the loyalty award / redeem path. We mock the Prisma
 * transaction so the math + state transitions are exercised without
 * needing a real DB. Run with `bun test`.
 */

import { describe, expect, test } from "bun:test";
import { POINTS_PER_DOLLAR, awardPoints, redeemPoints } from "../loyalty";

type StoredProfile = { loyaltyPointsByVenueId: Record<string, number> };

function mockTx(initial: StoredProfile) {
  // Single in-memory profile keyed by id "p1". Mirrors Prisma's chain
  // of `tx.guestProfile.findUnique` / `tx.guestProfile.update`.
  let store = { ...initial.loyaltyPointsByVenueId };
  const tx = {
    guestProfile: {
      findUnique: async () => ({ loyaltyPointsByVenueId: store }),
      update: async ({ data }: { data: { loyaltyPointsByVenueId: Record<string, number> } }) => {
        store = { ...data.loyaltyPointsByVenueId };
        return { id: "p1", loyaltyPointsByVenueId: store };
      },
    },
  } as unknown as Parameters<typeof awardPoints>[0];
  return { tx, peek: () => ({ ...store }) };
}

describe("awardPoints", () => {
  test("award against empty balance creates the venue key", async () => {
    const { tx, peek } = mockTx({ loyaltyPointsByVenueId: {} });
    const out = await awardPoints(tx, "p1", "v1", 25);
    expect(out).toEqual({ awarded: 25, balance: 25 });
    expect(peek()).toEqual({ v1: 25 });
  });

  test("award accumulates onto existing balance", async () => {
    const { tx, peek } = mockTx({ loyaltyPointsByVenueId: { v1: 50 } });
    const out = await awardPoints(tx, "p1", "v1", 12);
    expect(out).toEqual({ awarded: 12, balance: 62 });
    expect(peek()).toEqual({ v1: 62 });
  });

  test("award with zero/negative is a no-op but returns current balance", async () => {
    const { tx, peek } = mockTx({ loyaltyPointsByVenueId: { v1: 80 } });
    expect(await awardPoints(tx, "p1", "v1", 0)).toEqual({ awarded: 0, balance: 80 });
    expect(await awardPoints(tx, "p1", "v1", -5)).toEqual({ awarded: 0, balance: 80 });
    expect(peek()).toEqual({ v1: 80 });
  });

  test("award is per-venue (does not bleed across orgs)", async () => {
    const { tx, peek } = mockTx({ loyaltyPointsByVenueId: { v1: 30 } });
    await awardPoints(tx, "p1", "v2", 10);
    expect(peek()).toEqual({ v1: 30, v2: 10 });
  });

  test("fractional points are floored", async () => {
    const { tx } = mockTx({ loyaltyPointsByVenueId: {} });
    const out = await awardPoints(tx, "p1", "v1", 12.9);
    expect(out.awarded).toBe(12);
  });
});

describe("redeemPoints", () => {
  test("redeem within balance debits and returns discountCents", async () => {
    const { tx, peek } = mockTx({ loyaltyPointsByVenueId: { v1: 100 } });
    const r = await redeemPoints(tx, "p1", "v1", 60);
    if (!r.ok) throw new Error("expected ok");
    expect(r.redeemed).toBe(60);
    expect(r.balance).toBe(40);
    // 60 points at 20pt/$ = $3.00 = 300c
    expect(r.discountCents).toBe(300);
    expect(peek()).toEqual({ v1: 40 });
  });

  test("redeem more than balance fails without mutation", async () => {
    const { tx, peek } = mockTx({ loyaltyPointsByVenueId: { v1: 25 } });
    const r = await redeemPoints(tx, "p1", "v1", 50);
    expect(r).toEqual({ ok: false, reason: "INSUFFICIENT_BALANCE" });
    expect(peek()).toEqual({ v1: 25 });
  });

  test("redeem rejects non-positive amounts", async () => {
    const { tx } = mockTx({ loyaltyPointsByVenueId: { v1: 25 } });
    expect(await redeemPoints(tx, "p1", "v1", 0)).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
    expect(await redeemPoints(tx, "p1", "v1", -10)).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
  });

  test("conversion rate constant matches docs (20pt = $1)", () => {
    expect(POINTS_PER_DOLLAR).toBe(20);
  });
});
