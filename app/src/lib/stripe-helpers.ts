import type Stripe from "stripe";

/**
 * Collapse Stripe's ~10 subscription states into TabCall's 5-state
 * `SubscriptionStatus` enum. Lives outside the route file so it's
 * importable from tests (Next.js refuses arbitrary named exports from
 * route.ts modules).
 *
 * Any new Stripe state would silently fall through to NONE without this
 * map; the unit test enumerates every known Stripe status to lock the
 * mapping and surface drift on SDK upgrades.
 */
export function subscriptionStatusFor(
  s: Stripe.Subscription.Status,
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "NONE" {
  switch (s) {
    case "trialing":           return "TRIALING";
    case "active":             return "ACTIVE";
    case "past_due":           return "PAST_DUE";
    case "unpaid":             return "PAST_DUE";
    case "incomplete":         return "PAST_DUE";
    case "canceled":           return "CANCELED";
    case "incomplete_expired": return "CANCELED";
    case "paused":             return "CANCELED";
    default:                   return "NONE";
  }
}
