/**
 * Locks the Stripe → TabCall subscription-status mapping. If Stripe
 * adds a new state and our SDK upgrades to surface it, this test will
 * fail (the new state falls through to NONE, which silently disables
 * paywalled features). Update the mapping deliberately rather than
 * shipping a regression.
 *
 * Why this test matters: the only writer of `Organization.subscriptionStatus`
 * is the webhook handler; if the mapping is wrong, paid features
 * (analytics, tip pools) silently break for affected orgs.
 */

import { describe, expect, test } from "bun:test";
import { subscriptionStatusFor } from "../stripe-helpers";

describe("subscriptionStatusFor", () => {
  test("active → ACTIVE", () => expect(subscriptionStatusFor("active")).toBe("ACTIVE"));
  test("trialing → TRIALING", () => expect(subscriptionStatusFor("trialing")).toBe("TRIALING"));

  test("past_due / unpaid / incomplete → PAST_DUE (grace-period bucket)", () => {
    expect(subscriptionStatusFor("past_due")).toBe("PAST_DUE");
    expect(subscriptionStatusFor("unpaid")).toBe("PAST_DUE");
    expect(subscriptionStatusFor("incomplete")).toBe("PAST_DUE");
  });

  test("canceled / incomplete_expired / paused → CANCELED", () => {
    expect(subscriptionStatusFor("canceled")).toBe("CANCELED");
    expect(subscriptionStatusFor("incomplete_expired")).toBe("CANCELED");
    expect(subscriptionStatusFor("paused")).toBe("CANCELED");
  });

  test("unknown Stripe state falls through to NONE", () => {
    // Cast: a future Stripe SDK might add a new state; we want to surface
    // it as NONE (no paid features) rather than ACTIVE (free upgrade).
    expect(subscriptionStatusFor("brand_new_stripe_state" as never)).toBe("NONE");
  });
});
