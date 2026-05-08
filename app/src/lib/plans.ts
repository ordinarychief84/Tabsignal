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

const PRICE_TO_PLAN: Record<string, PlanId> = Object.fromEntries(
  PLANS.filter(p => p.stripePriceId).map(p => [p.stripePriceId!, p.id])
);

export function planByPriceId(priceId: string): PlanId | null {
  return PRICE_TO_PLAN[priceId] ?? null;
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

type OrgPlanFields = {
  subscriptionPriceId: string | null;
  subscriptionStatus: string;
};

export function planFromOrg(org: OrgPlanFields): PlanId {
  if (!ACCESS_GRANTING.includes(org.subscriptionStatus)) return "free";
  if (!org.subscriptionPriceId) return "free";
  return planByPriceId(org.subscriptionPriceId) ?? "free";
}
