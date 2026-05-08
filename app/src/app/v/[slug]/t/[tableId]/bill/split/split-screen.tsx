"use client";

import { useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { dollars } from "@/lib/bill";

type Split = {
  id: string;
  label: string | null;
  amountCents: number;
  tipPercent: number;
  paidAt: string | null;
};

type Props = {
  slug: string;
  tableLabel: string;
  sessionId: string;
  sessionToken: string;
  subtotalPlusTaxCents: number;
  initialSplits: Split[];
};

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe() {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

export function SplitScreen({
  slug,
  tableLabel,
  sessionId,
  sessionToken,
  subtotalPlusTaxCents,
  initialSplits,
}: Props) {
  const [splits, setSplits] = useState<Split[]>(initialSplits);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);
  const [activeClientSecret, setActiveClientSecret] = useState<string | null>(null);

  async function createSplits(count: number) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/splits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, sessionToken, tipPercent: 0 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setSplits(body.splits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not split");
    } finally {
      setCreating(false);
    }
  }

  async function payFor(split: Split, tipPercent: number) {
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/splits/${split.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, tipPercent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setActiveSplitId(split.id);
      setActiveClientSecret(body.clientSecret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
    }
  }

  if (activeSplitId && activeClientSecret) {
    const split = splits.find(s => s.id === activeSplitId)!;
    const tokenSegment = `?s=${encodeURIComponent(sessionToken)}`;
    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill/split${tokenSegment}`
        : `/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill/split${tokenSegment}`;
    return (
      <Elements
        stripe={getStripe()}
        options={{ clientSecret: activeClientSecret, appearance: { theme: "stripe" } }}
      >
        <PayForm
          splitLabel={split.label ?? "Person"}
          amountCents={split.amountCents}
          returnUrl={returnUrl}
          onBack={() => {
            setActiveSplitId(null);
            setActiveClientSecret(null);
          }}
        />
      </Elements>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}

      {splits.length === 0 ? (
        <section className="rounded-2xl border border-slate/10 bg-white p-5">
          <p className="text-sm text-slate/70">Split the bill into how many parts?</p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[2, 3, 4, 5, 6, 7, 8].map(n => (
              <button
                key={n}
                disabled={creating}
                onClick={() => createSplits(n)}
                className="rounded-full border border-slate/15 px-4 py-2 text-sm hover:border-slate/40 disabled:opacity-50"
              >
                {n}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {splits.length > 0 ? (
        <section className="rounded-2xl border border-slate/10 bg-white">
          <header className="border-b border-slate/10 px-5 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-umber">
              {splits.length}-way split
            </p>
            <p className="text-xs text-slate/50">
              Each person picks their own tip when they pay.
            </p>
          </header>
          <ul className="divide-y divide-slate/5">
            {splits.map(s => (
              <SplitRow
                key={s.id}
                split={s}
                onPay={tip => payFor(s, tip)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SplitRow({ split, onPay }: { split: Split; onPay: (tipPercent: number) => void }) {
  const [tip, setTip] = useState<number>(20);
  const tipCents = Math.round(split.amountCents * (tip / 100));
  const total = split.amountCents + tipCents;
  const paid = !!split.paidAt;

  return (
    <li className={paid ? "px-5 py-4 opacity-50" : "px-5 py-4"}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{split.label}</p>
          <p className="text-xs text-slate/50">
            Subtotal share: {dollars(split.amountCents)}
          </p>
        </div>
        {paid ? (
          <span className="rounded-full bg-slate/10 px-3 py-1 text-[11px] text-slate/70">Paid</span>
        ) : null}
      </div>
      {!paid ? (
        <>
          <div className="mt-3 flex gap-2 text-xs">
            {[15, 20, 25].map(n => (
              <button
                key={n}
                onClick={() => setTip(n)}
                className={[
                  "rounded-full border px-3 py-1",
                  n === tip
                    ? "border-slate bg-slate text-oat"
                    : "border-slate/15 text-slate/70 hover:border-slate/40",
                ].join(" ")}
              >
                {n}%
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate/60">
              Total: {dollars(total)}
            </span>
            <button
              onClick={() => onPay(tip)}
              className="rounded-full bg-slate px-4 py-1.5 text-xs text-oat hover:bg-slate/90"
            >
              Pay {dollars(total)}
            </button>
          </div>
        </>
      ) : null}
    </li>
  );
}

function PayForm({
  splitLabel,
  amountCents,
  returnUrl,
  onBack,
}: {
  splitLabel: string;
  amountCents: number;
  returnUrl: string;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <header className="rounded-2xl border border-slate/10 bg-white p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{splitLabel}</p>
        <p className="mt-1 text-2xl font-medium">Pay {dollars(amountCents)}</p>
      </header>
      <div className="rounded-2xl border border-slate/10 bg-white p-5">
        <PaymentElement />
      </div>
      {error ? (
        <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-slate/15 px-4 py-2 text-sm hover:border-slate/40"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
        >
          {submitting ? "Paying…" : "Pay"}
        </button>
      </div>
    </form>
  );
}
