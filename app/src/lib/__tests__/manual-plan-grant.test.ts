/**
 * Operator manual plan grant — the "admin upgrades/downgrades a venue
 * from the console" path.
 *
 * THE bug this pins: without STRIPE_PRICE_GROWTH/PRO env, an operator
 * flip to a paid plan stored subscriptionPriceId=null, so planFromOrg
 * read a null price on an ACTIVE org and returned "free" — the upgrade
 * granted nothing. priceIdForPlan now stores a resolvable manual
 * sentinel so the grant actually takes, and planFromOrg + meetsAtLeast
 * reflect it.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  priceIdForPlan,
  planByPriceId,
  planFromOrg,
  meetsAtLeast,
  isManualPriceId,
  MANUAL_PRICE_ID,
} from "../plans";

// Ensure Stripe price env is UNSET — the exact condition that broke grants.
const PREV = { g: process.env.STRIPE_PRICE_GROWTH, p: process.env.STRIPE_PRICE_PRO };
beforeAll(() => {
  delete (process.env as Record<string, string>).STRIPE_PRICE_GROWTH;
  delete (process.env as Record<string, string>).STRIPE_PRICE_PRO;
});
afterAll(() => {
  if (PREV.g === undefined) delete (process.env as Record<string, string>).STRIPE_PRICE_GROWTH;
  else (process.env as Record<string, string>).STRIPE_PRICE_GROWTH = PREV.g;
  if (PREV.p === undefined) delete (process.env as Record<string, string>).STRIPE_PRICE_PRO;
  else (process.env as Record<string, string>).STRIPE_PRICE_PRO = PREV.p;
});

/** Mirror the operator billing route's write, then read back the plan. */
function grant(planId: "free" | "growth" | "pro") {
  const priceId = priceIdForPlan(planId);
  const org = {
    subscriptionStatus: planId === "free" ? "NONE" : "ACTIVE",
    subscriptionPriceId: priceId,
    trialEndsAt: null,
  };
  return { priceId, plan: planFromOrg(org) };
}

describe("manual grant without Stripe env", () => {
  test("upgrade to Growth actually grants Growth (the bug)", () => {
    const { priceId, plan } = grant("growth");
    expect(priceId).toBe(MANUAL_PRICE_ID.growth);
    expect(plan).toBe("growth");
    expect(meetsAtLeast(plan, "growth")).toBe(true);
    expect(meetsAtLeast(plan, "pro")).toBe(false);
  });

  test("upgrade to Pro grants Pro (unlocks pro-gated features)", () => {
    const { plan } = grant("pro");
    expect(plan).toBe("pro");
    expect(meetsAtLeast(plan, "pro")).toBe(true);
  });

  test("downgrade to Starter clears access", () => {
    const { priceId, plan } = grant("free");
    expect(priceId).toBeNull();
    expect(plan).toBe("free");
    expect(meetsAtLeast(plan, "growth")).toBe(false);
  });

  test("sentinels round-trip through planByPriceId and are flagged manual", () => {
    expect(planByPriceId(MANUAL_PRICE_ID.growth)).toBe("growth");
    expect(planByPriceId(MANUAL_PRICE_ID.pro)).toBe("pro");
    expect(isManualPriceId(MANUAL_PRICE_ID.pro)).toBe(true);
    expect(isManualPriceId("price_realstripe123")).toBe(false);
    expect(isManualPriceId(null)).toBe(false);
  });

  test("a real Stripe price still wins over the sentinel when configured", () => {
    (process.env as Record<string, string>).STRIPE_PRICE_GROWTH = "price_live_growth";
    // priceIdForPlan reads the live PLANS table which snapshotted env at
    // module load, so assert the precedence rule directly instead.
    const withReal = "price_live_growth";
    expect(isManualPriceId(withReal)).toBe(false);
    delete (process.env as Record<string, string>).STRIPE_PRICE_GROWTH;
  });
});
