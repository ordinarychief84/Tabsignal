/**
 * SaaS plans. Stripe Price IDs come from env so the same code targets
 * test / live accounts without a redeploy. Free tier = no recurring
 * charge but the platform still earns the 0.5% transaction fee.
 */

export type PlanId = "free" | "growth" | "pro";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  monthlyCents: number;
  // null on the free tier; the env-supplied Stripe Price ID otherwise.
  stripePriceId: string | null;
  tagline: string;
  features: string[];
  // Soft gates the UI uses to badge upgrade-only sections.
  requiresAtLeast?: PlanId;
};

export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Starter",
    monthlyCents: 0,
    stripePriceId: null,
    tagline: "QR + requests + Stripe payments. 0.5% per transaction.",
    features: [
      "Realtime request queue",
      "Stripe payments + Connect",
      "Bad-rating intercept (basic)",
      "Up to 1 staff member",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    monthlyCents: 9900,
    stripePriceId: process.env.STRIPE_PRICE_GROWTH ?? null,
    tagline: "Menu, pre-order, analytics, unlimited staff.",
    features: [
      "Everything in Starter",
      "Menu management",
      "Pre-order via QR",
      "Analytics dashboard (today / 7d / 30d)",
      "Bill split (multi-card)",
      "Tip pooling",
      "Unlimited staff",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyCents: 29900,
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
    tagline: "Multi-location, custom branding, advanced ops.",
    features: [
      "Everything in Growth",
      "Multi-location operator console",
      "Custom branding (logo + color)",
      "Industry benchmarking",
      "Loyalty program",
      "Priority support",
    ],
  },
];

export function planById(id: string): PlanDefinition | null {
  return PLANS.find(p => p.id === id) ?? null;
}

// Sentinel price IDs for OPERATOR-GRANTED (comp / concierge) plans that
// have no Stripe subscription behind them. Without these, an operator
// flip to Growth/Pro stored subscriptionPriceId=null, and planFromOrg
// then read a null price on an ACTIVE org and fell back to "free" — the
// upgrade silently granted nothing. Storing a resolvable sentinel makes
// the manual grant actually take. A real Stripe webhook later overwrites
// it with the true price ID if the org is put on paid billing.
export const MANUAL_PRICE_ID: Record<Exclude<PlanId, "free">, string> = {
  growth: "manual_growth",
  pro: "manual_pro",
};

const PRICE_TO_PLAN: Record<string, PlanId> = {
  ...Object.fromEntries(PLANS.filter(p => p.stripePriceId).map(p => [p.stripePriceId!, p.id])),
  // Manual grants resolve regardless of whether STRIPE_PRICE_* is set.
  [MANUAL_PRICE_ID.growth]: "growth",
  [MANUAL_PRICE_ID.pro]: "pro",
};

export function planByPriceId(priceId: string): PlanId | null {
  return PRICE_TO_PLAN[priceId] ?? null;
}

/**
 * The price ID to persist when granting a plan. Prefers the real Stripe
 * price (so genuine billing round-trips), else the manual sentinel so an
 * operator comp grant still resolves to the right tier. `free` clears it.
 */
export function priceIdForPlan(planId: PlanId): string | null {
  if (planId === "free") return null;
  return planById(planId)?.stripePriceId ?? MANUAL_PRICE_ID[planId];
}

/** True when a stored price ID is an operator comp grant, not real Stripe. */
export function isManualPriceId(priceId: string | null): boolean {
  return priceId === MANUAL_PRICE_ID.growth || priceId === MANUAL_PRICE_ID.pro;
}

export function rankOf(plan: PlanId): number {
  return PLANS.findIndex(p => p.id === plan);
}

export function meetsAtLeast(current: PlanId, required: PlanId): boolean {
  return rankOf(current) >= rankOf(required);
}

// Subscription statuses that grant access to the paid plan. PAST_DUE keeps
// the venue running while Stripe retries — the billing page nags them to
// fix payment. CANCELED / NONE drops them back to free.
const ACCESS_GRANTING: ReadonlyArray<string> = ["ACTIVE", "TRIALING", "PAST_DUE"];

// Every new self-serve org starts on this many days of Growth, no card
// required. Signup stamps subscriptionStatus=TRIALING + trialEndsAt;
// planFromOrg below grants Growth until the stamp expires, then the org
// falls back to free automatically — no cron needed.
export const PLATFORM_TRIAL_DAYS = 14;
export const PLATFORM_TRIAL_PLAN: PlanId = "growth";

type OrgPlanFields = {
  subscriptionPriceId: string | null;
  subscriptionStatus: string;
  // Optional so legacy call sites that don't select it keep compiling —
  // they simply don't honor platform trials.
  trialEndsAt?: Date | string | null;
};

export function planFromOrg(org: OrgPlanFields): PlanId {
  if (!ACCESS_GRANTING.includes(org.subscriptionStatus)) return "free";
  if (!org.subscriptionPriceId) {
    // Platform trial: TRIALING with no Stripe subscription behind it.
    // Time-boxed by trialEndsAt; expiry downgrades to free lazily on
    // the next read (webhooks never fire for card-less trials).
    if (org.subscriptionStatus === "TRIALING" && org.trialEndsAt) {
      const ends = new Date(org.trialEndsAt);
      if (!Number.isNaN(ends.getTime()) && ends.getTime() > Date.now()) {
        return PLATFORM_TRIAL_PLAN;
      }
    }
    return "free";
  }
  return planByPriceId(org.subscriptionPriceId) ?? "free";
}

/** Days left in a platform trial; null when not on a card-less trial. */
export function trialDaysLeft(org: OrgPlanFields): number | null {
  if (org.subscriptionStatus !== "TRIALING" || org.subscriptionPriceId || !org.trialEndsAt) return null;
  const ends = new Date(org.trialEndsAt);
  if (Number.isNaN(ends.getTime())) return null;
  const days = Math.ceil((ends.getTime() - Date.now()) / 86_400_000);
  return days > 0 ? days : null;
}
