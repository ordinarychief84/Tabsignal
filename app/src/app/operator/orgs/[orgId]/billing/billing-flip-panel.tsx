"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plan = { id: string; name: string; monthlyCents: number; configured: boolean };
type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

const STATUSES: Status[] = ["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"];

export function BillingFlipPanel({
  orgId,
  currentPlanId,
  currentStatus,
  plans,
}: {
  orgId: string;
  currentPlanId: string;
  currentStatus: string;
  plans: Plan[];
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState<string>(currentPlanId);
  const [status, setStatus] = useState<Status>((currentStatus as Status) || "NONE");
  const [trialEndsAt, setTrialEndsAt] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function flip() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/operator/orgs/${orgId}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          status,
          trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
          reason: reason.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      if (body.note) setNote(body.note);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate/10 bg-white p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Set tier</p>
      <p className="mt-1 text-xs text-slate/55">
        Pick the plan you agreed to on the call. Status defaults to ACTIVE
        for paid plans, NONE for free.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {plans.map(p => {
          const sel = planId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlanId(p.id)}
              className={[
                "rounded-xl border p-4 text-left transition-colors",
                sel ? "border-slate bg-slate text-oat"
                    : "border-slate/15 bg-white hover:border-slate/40",
              ].join(" ")}
            >
              <p className="text-[11px] uppercase tracking-wider opacity-70">{p.name}</p>
              <p className="mt-1 text-lg font-medium">
                {p.id === "free" ? "Free" : `$${(p.monthlyCents / 100).toFixed(0)}`}
              </p>
              {!p.configured ? (
                <p className="mt-1 text-[10px] uppercase tracking-wider opacity-60">env not set</p>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Status</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as Status)}
            className="mt-2 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Trial ends (optional)</span>
          <input
            type="date"
            value={trialEndsAt}
            onChange={e => setTrialEndsAt(e.target.value)}
            className="mt-2 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Reason (audit log)</span>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Setup call 2026-05-09 · Otto&rsquo;s Lounge agreed to Pro"
          className="mt-2 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </label>

      {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
      {note ? (
        <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-xs text-slate/75">{note}</p>
      ) : null}

      <button
        onClick={flip}
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-chartreuse py-3 text-sm font-medium text-slate disabled:opacity-50"
      >
        {busy ? "Flipping…" : `Flip ${planId} · ${status}`}
      </button>

      <p className="mt-3 text-[11px] text-slate/45">
        This records the plan in our DB only. To actually invoice, also create
        a Stripe Subscription on this Customer in the Stripe Dashboard. The
        webhook will sync subscriptionPriceId / subscriptionPeriodEnd on
        the next billing event.
      </p>
    </section>
  );
}
