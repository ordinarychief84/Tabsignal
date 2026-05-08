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
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function BillingPanel({ slug, currentPlanId, plans, hasSubscription, status }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(planId: "growth" | "pro") {
    setPending(planId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body?.error ?? `HTTP ${res.status}`);
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
      setPending(null);
    }
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

      {hasSubscription ? (
        <section className="rounded-2xl border border-slate/10 bg-white p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Current</p>
              <p className="mt-1 text-base font-medium">Status: {status}</p>
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
