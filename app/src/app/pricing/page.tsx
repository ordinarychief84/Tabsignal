import Link from "next/link";
import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "../marketing-chrome";

/**
 * Scoped pricing page. Renders only the pricing tiers + nav + footer.
 * Clicking "Pricing" in the navbar lands here, not on the landing-page
 * anchor — matches the click-to-detail behaviour used by /features and
 * /how-it-works.
 */

export const metadata: Metadata = {
  title: "TabCall · Pricing",
  description:
    "Starter is free at 5 tables. Growth ($99/mo) and Pro ($299/mo) start with a 14-day free trial. Founding is concierge only.",
};

type PricingTier = {
  key: "starter" | "growth" | "pro" | "founding";
  name: string;
  price: string;
  sub: string;
  tagline: string;
  trial: boolean;
  cta: string;
  ctaHref: string;
  highlight: boolean;
  /** Header above the feature list — e.g. "Everything in Growth, plus:". */
  inheritsFrom?: string;
  /** Feature bullets shown on the card. */
  features: string[];
};

const PRICING_TIERS: PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    price: "Free",
    sub: "Up to 5 tables. No card.",
    tagline: "Live tonight. The essentials, free forever.",
    trial: false,
    cta: "Start free",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "Call waiter, request bill, ask for help, refill",
      "Live request queue (staff PWA)",
      "Push notifications when backgrounded",
      "Reviews and ratings, 1–5 stars",
      "Stripe Connect payments (Apple Pay, Google Pay, cards)",
      "Email support",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    price: "$99",
    sub: "per month, up to 25 tables",
    tagline: "For restaurants that want the floor moving faster.",
    trial: true,
    cta: "Start free trial",
    ctaHref: "/signup?plan=growth",
    highlight: true,
    inheritsFrom: "Starter",
    features: [
      "Full digital menu with photos and modifiers",
      "QR ordering from the table",
      "Bill splitting (by item or share) and tipping",
      "Pre-orders from QR before seated",
      "Wishlist guests can share with the server",
      "Reservations and waitlist",
      "Tip pool",
      "Manager analytics: response time, completion, peak hours",
      "Auto-escalation and request hand-off",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$299",
    sub: "per month, unlimited tables",
    tagline: "For groups and multi-location operators.",
    trial: true,
    cta: "Start free trial",
    ctaHref: "/signup?plan=pro",
    highlight: false,
    inheritsFrom: "Growth",
    features: [
      "Loyalty: returning-guest identify, points, visit history",
      "Promotions and banners (happy hour, lunch, new dish)",
      "Branding: logo, banner, brand colors, welcome message",
      "POS integration: Toast, Square, Clover (preview)",
      "Multi-location operator console",
      "Cross-venue benchmarks (k≥5)",
      "Security dashboard and audit log",
      "Priority support",
    ],
  },
  {
    key: "founding",
    name: "Founding",
    price: "On request",
    sub: "Concierge onboarding only",
    tagline: "We set it up, you run service.",
    trial: false,
    cta: "Talk to us",
    ctaHref: "mailto:hello@tab-call.com",
    highlight: false,
    inheritsFrom: "Pro",
    features: [
      "TabCall-managed setup (QR print, menu import, staff invite)",
      "Dedicated Slack channel with the team",
      "Custom integrations on request",
      "Direct line into the product roadmap",
      "Quarterly business review",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="bg-oat text-slate">
      <MarketingNav />

      <section className="relative overflow-hidden border-b border-umber-soft/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 50% at 80% 20%, rgba(199, 214, 207, 0.4) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(40% 40% at 10% 90%, rgba(242, 231, 183, 0.28) 0%, rgba(247, 245, 242, 0) 65%)",
          }}
        />
        <div className="mx-auto max-w-7xl px-5 py-14 text-center md:px-8 md:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-soft/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/75">
            Pricing
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-[34px] font-semibold leading-[1.05] tracking-[-0.01em] text-slate md:text-[44px] lg:text-[56px]">
            Pick the plan that matches the floor
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-slate/65 md:text-[17px]">
            Starter is free at 5 tables. Growth and Pro start with a 14-day
            free trial. Founding is concierge only.
          </p>
        </div>
      </section>

      <section className="bg-oat py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_TIERS.map((t) => (
              <article
                key={t.key}
                className={[
                  "flex flex-col rounded-2xl p-6 transition-all hover:-translate-y-0.5",
                  t.highlight
                    ? "border-2 border-chartreuse bg-white shadow-lift ring-1 ring-chartreuse/40"
                    : "border border-umber-soft/30 bg-white shadow-card",
                ].join(" ")}
              >
                <div className="flex h-[26px] items-center">
                  {t.trial ? (
                    <span className="inline-flex items-center rounded-full bg-chartreuse px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">
                      14-day free trial
                    </span>
                  ) : t.highlight ? (
                    <span className="inline-flex items-center rounded-full bg-sea-soft/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate/75">
                      Most popular
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-3 text-lg font-semibold text-slate">{t.name}</h3>

                <p className="mt-2 text-[34px] font-semibold leading-none tracking-tight text-slate">
                  {t.price}
                </p>
                <p className="mt-1 text-xs text-slate/55">{t.sub}</p>

                <p className="mt-4 text-[13px] leading-relaxed text-slate/70">{t.tagline}</p>

                <Link
                  href={t.ctaHref}
                  className={[
                    "mt-5 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                    t.highlight
                      ? "bg-chartreuse text-slate hover:bg-chartreuse/85"
                      : "border border-slate/15 bg-white text-slate hover:border-slate/30",
                  ].join(" ")}
                >
                  {t.cta}
                </Link>

                <div className="mt-6 border-t border-umber-soft/30 pt-5">
                  {t.inheritsFrom ? (
                    <p className="text-[11px] font-semibold text-slate">
                      Everything in {t.inheritsFrom}, plus:
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-umber">
                      What&rsquo;s included
                    </p>
                  )}
                  <ul className="mt-3 space-y-2.5">
                    {t.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[12px] leading-snug text-slate/75">
                        <PricingCheck />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-10 text-center text-xs text-slate/55">
            Growth and Pro start with a 14-day free trial. No card needed to
            start. All plans run month to month. Stripe processing (2.9% +
            30¢) is passed through at cost.
          </p>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

function PricingCheck() {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sea-soft/70 text-slate"
    >
      <svg width="9" height="9" viewBox="0 0 12 12">
        <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
