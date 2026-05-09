"use client";

import { useState } from "react";

/**
 * Two-state CTA: "Connect Stripe" (no account yet) or "Continue Stripe
 * onboarding" (account exists but charges not enabled). Either way,
 * one POST to `/api/admin/v/:slug/stripe/connect` returns a Stripe-
 * hosted onboarding URL we redirect to. When the manager finishes,
 * they're sent back to ?stripe=return and the `account.updated`
 * webhook flips `stripeChargesEnabled`.
 */
export function ConnectStripeButton({
  slug,
  attached,
}: {
  slug: string;
  attached: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/stripe/connect`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        // Surface Stripe's actual reason (e.g. "Connect platform not
        // activated", invalid api key) instead of a generic shrug.
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }
      if (!data.url) throw new Error("no_url");
      // Stripe-hosted onboarding flow. Manager fills business details,
      // bank info, identity verification — Stripe walks them through.
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start onboarding");
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90 disabled:opacity-60"
      >
        {loading
          ? "Opening Stripe…"
          : attached
          ? "Continue Stripe onboarding →"
          : "Connect Stripe →"}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-coral">
          Couldn&rsquo;t open Stripe: {error}. Try again or email TabCall.
        </p>
      ) : null}
    </div>
  );
}
