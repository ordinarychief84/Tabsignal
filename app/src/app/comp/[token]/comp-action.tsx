"use client";

import { useState } from "react";

type Phase = "idle" | "applying" | "applied" | "error";

export function CompAction({
  token,
  tableLabel,
  amountCents,
  alreadyPaid,
  alreadyApplied,
}: {
  token: string;
  tableLabel: string;
  amountCents: number;
  alreadyPaid: boolean;
  alreadyApplied: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(alreadyApplied ? "applied" : "idle");
  const [error, setError] = useState<string | null>(null);

  if (alreadyPaid) {
    return (
      <div className="mt-8 rounded-2xl border border-coral/40 bg-coral/15 p-5">
        <p className="text-sm font-medium text-coral">Tab already paid</p>
        <p className="mt-1 text-sm text-oat/70">
          Issue this comp as a Stripe refund instead — open the Stripe
          dashboard, find the payment, refund ${(amountCents / 100).toFixed(0)}.
        </p>
      </div>
    );
  }

  if (phase === "applied") {
    return (
      <div className="mt-8 rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-5">
        <p className="text-sm font-medium text-chartreuse">Comp applied</p>
        <p className="mt-1 text-sm text-oat/80">
          ${(amountCents / 100).toFixed(0)} credited to {tableLabel}. Your
          server&rsquo;s phone just lit up — they&rsquo;ll deliver the next
          round on the house.
        </p>
      </div>
    );
  }

  async function apply() {
    setPhase("applying");
    setError(null);
    try {
      const res = await fetch("/api/comp/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setPhase("applied");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Couldn't apply the comp.");
    }
  }

  return (
    <div className="mt-8 space-y-3">
      <button
        type="button"
        onClick={apply}
        disabled={phase === "applying"}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {phase === "applying" ? "Applying…" : `Comp $${(amountCents / 100).toFixed(0)} now`}
      </button>
      <a
        href="/admin"
        className="block w-full rounded-xl border border-white/10 py-3 text-center text-sm text-oat/70 hover:text-oat"
      >
        Cancel
      </a>
      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{error}</p>
      ) : null}
    </div>
  );
}
