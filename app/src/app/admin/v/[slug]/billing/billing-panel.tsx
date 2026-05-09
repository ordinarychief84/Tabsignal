"use client";

import { useState } from "react";

type PlanCard = {
  id: string;
  name: string;
  monthlyCents: number;
  tagline: string;
  features: string[];
  configured: boolean;
};

type Props = {
  slug: string;
  currentPlanId: string;
  plans: PlanCard[];
  hasSubscription: boolean;
  status: string;
  trialEndsAt: string | null;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function statusLabel(status: string): { label: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  switch (status) {
    case "ACTIVE":   return { label: "Active",                  tone: "ok"      };
    case "TRIALING": return { label: "Trialing",                tone: "ok"      };
    case "PAST_DUE": return { label: "Payment failed",          tone: "bad"     };
    case "CANCELED": return { label: "Canceled",                tone: "neutral" };
    default:         return { label: "Inactive",                tone: "neutral" };
  }
}

function daysBetween(target: Date, from: Date): number {
  return Math.ceil((target.getTime() - from.getTime()) / 86_400_000);
}

export function BillingPanel({ slug, currentPlanId, plans, hasSubscription, status, trialEndsAt }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Concierge intercept: instead of jumping to Stripe checkout, route
  // Growth/Pro upgrades through a 15-min setup call screen first. After
  // the call we flip the org via the operator console / SQL, then the
  // existing checkout flow takes over for self-service plan changes
  // (e.g. Growth → Pro). This is also the natural sales motion at the
  // moment of intent.
  function startCheckout(planId: "growth" | "pro") {
    setPending(planId);
    window.location.href = `/admin/v/${slug}/billing/upgrade-contact?plan=${planId}`;
  }

  async function openPortal() {
    setPending("portal");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/billing/portal`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body?.error ?? `HTTP ${res.status}`);
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open portal");
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</p>
      ) : null}

      {status === "PAST_DUE" ? (
        <section className="rounded-2xl border border-coral/40 bg-coral/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-coral">Action needed</p>
              <p className="mt-1 text-base font-medium text-slate">Your last payment failed.</p>
              <p className="mt-1 text-xs text-slate/70">
                Stripe will retry, but features will be cut off if it doesn&rsquo;t go through soon.
                Update your card to keep your subscription active.
              </p>
            </div>
            <button
              onClick={openPortal}
              disabled={pending === "portal"}
              className="shrink-0 rounded-full bg-coral px-4 py-2 text-sm text-white hover:bg-coral/90 disabled:opacity-50"
            >
              {pending === "portal" ? "Opening…" : "Update payment"}
            </button>
          </div>
        </section>
      ) : null}

      {status === "TRIALING" && trialEndsAt ? (
        (() => {
          const days = daysBetween(new Date(trialEndsAt), new Date());
          if (days < 0) return null;
          return (
            <section className="rounded-2xl border border-chartreuse/40 bg-chartreuse/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Trial</p>
              <p className="mt-1 text-base font-medium text-slate">
                {days === 0 ? "Trial ends today." : `Trial ends in ${days} day${days === 1 ? "" : "s"}.`}
              </p>
              <p className="mt-1 text-xs text-slate/70">
                Your card will be charged on {new Date(trialEndsAt).toLocaleDateString()} unless you cancel.
              </p>
            </section>
          );
        })()
      ) : null}

      {hasSubscription ? (
        <section className="rounded-2xl border border-slate/10 bg-white p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Current</p>
              <p className="mt-1 text-base font-medium">
                Status:{" "}
                <span
                  className={[
                    statusLabel(status).tone === "ok"   ? "text-slate"  : "",
                    statusLabel(status).tone === "bad"  ? "text-coral"  : "",
                    statusLabel(status).tone === "warn" ? "text-umber"  : "",
                    statusLabel(status).tone === "neutral" ? "text-slate/60" : "",
                  ].join(" ")}
                >
                  {statusLabel(status).label}
                </span>
              </p>
            </div>
            <button
              onClick={openPortal}
              disabled={pending === "portal"}
              className="rounded-full border border-slate/15 px-4 py-2 text-sm hover:border-slate/40 disabled:opacity-50"
            >
              {pending === "portal" ? "Opening…" : "Manage subscription"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {plans.map(p => {
          const isCurrent = p.id === currentPlanId;
          const isFree = p.id === "free";
          return (
            <article
              key={p.id}
              className={[
                "rounded-2xl border p-5",
                isCurrent ? "border-slate bg-white shadow-sm" : "border-slate/10 bg-white",
              ].join(" ")}
            >
              <header>
                <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{p.name}</p>
                <p className="mt-1 text-2xl font-medium">
                  {dollars(p.monthlyCents)}<span className="text-xs text-slate/50">/mo</span>
                </p>
                <p className="mt-1 text-xs text-slate/60">{p.tagline}</p>
              </header>
              <ul className="mt-4 space-y-1.5 text-xs text-slate/70">
                {p.features.map((f, i) => <li key={i}>· {f}</li>)}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <span className="inline-block rounded-full bg-slate/10 px-3 py-1 text-xs text-slate/70">
                    Current plan
                  </span>
                ) : isFree ? (
                  <span className="inline-block rounded-full bg-slate/5 px-3 py-1 text-xs text-slate/50">
                    Default
                  </span>
                ) : !p.configured ? (
                  <span className="inline-block rounded-full bg-slate/5 px-3 py-1 text-xs text-slate/50">
                    Coming soon
                  </span>
                ) : (
                  <button
                    onClick={() => startCheckout(p.id as "growth" | "pro")}
                    disabled={pending === p.id}
                    className="w-full rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
                  >
                    {pending === p.id ? "Loading…" : `Upgrade to ${p.name}`}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <p className="text-xs text-slate/50">
        Card payments are processed by Stripe. You can change or cancel any time via &ldquo;Manage subscription&rdquo;.
      </p>
    </div>
  );
}
