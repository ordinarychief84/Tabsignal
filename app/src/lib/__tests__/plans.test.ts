import { describe, expect, test } from "bun:test";
import { planFromOrg, trialDaysLeft, meetsAtLeast, PLATFORM_TRIAL_PLAN } from "../plans";

const DAY = 86_400_000;

describe("planFromOrg", () => {
  test("NONE / CANCELED → free regardless of priceId", () => {
    expect(planFromOrg({ subscriptionPriceId: null, subscriptionStatus: "NONE" })).toBe("free");
    expect(
      planFromOrg({ subscriptionPriceId: "price_x", subscriptionStatus: "CANCELED" }),
    ).toBe("free");
  });

  test("ACTIVE with unknown priceId falls back to free", () => {
    expect(
      planFromOrg({ subscriptionPriceId: "price_unknown", subscriptionStatus: "ACTIVE" }),
    ).toBe("free");
  });

  test("platform trial: TRIALING + no priceId + future trialEndsAt grants the trial plan", () => {
    const plan = planFromOrg({
      subscriptionPriceId: null,
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 3 * DAY),
    });
    expect(plan).toBe(PLATFORM_TRIAL_PLAN);
    expect(meetsAtLeast(plan, "growth")).toBe(true);
  });

  test("platform trial expires lazily: past trialEndsAt → free", () => {
    expect(
      planFromOrg({
        subscriptionPriceId: null,
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() - DAY),
      }),
    ).toBe("free");
  });

  test("TRIALING with no trialEndsAt (legacy rows) → free, not forever-growth", () => {
    expect(
      planFromOrg({ subscriptionPriceId: null, subscriptionStatus: "TRIALING" }),
    ).toBe("free");
    expect(
      planFromOrg({
        subscriptionPriceId: null,
        subscriptionStatus: "TRIALING",
        trialEndsAt: null,
      }),
    ).toBe("free");
  });

  test("string trialEndsAt (serialized) works too", () => {
    expect(
      planFromOrg({
        subscriptionPriceId: null,
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + DAY).toISOString(),
      }),
    ).toBe(PLATFORM_TRIAL_PLAN);
  });
});

describe("trialDaysLeft", () => {
  test("counts remaining days, ceiling", () => {
    const days = trialDaysLeft({
      subscriptionPriceId: null,
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 2.2 * DAY),
    });
    expect(days).toBe(3);
  });

  test("null for expired, non-trialing, or Stripe-backed trials", () => {
    expect(
      trialDaysLeft({
        subscriptionPriceId: null,
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() - DAY),
      }),
    ).toBeNull();
    expect(
      trialDaysLeft({ subscriptionPriceId: null, subscriptionStatus: "ACTIVE", trialEndsAt: new Date() }),
    ).toBeNull();
    // Stripe-backed trial: card on file, Stripe owns the countdown copy.
    expect(
      trialDaysLeft({
        subscriptionPriceId: "price_x",
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + DAY),
      }),
    ).toBeNull();
  });
});
