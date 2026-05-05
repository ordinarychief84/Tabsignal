"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { dollars, totalsFor, type LineItem } from "@/lib/bill";

type BillData = {
  sessionId: string;
  venueName: string;
  tableLabel: string;
  items: LineItem[];
  defaultTipPercent: number;
  totals: {
    subtotalCents: number;
    taxCents: number;
    tipCents: number;
    totalCents: number;
  };
};

const TIP_PRESETS = [15, 20, 25];

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe() {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

type Stage = "review" | "pay";

export function BillScreen({ data, zipCode, slug }: { data: BillData; zipCode: string; slug: string }) {
  const [tipPercent, setTipPercent] = useState<number>(data.defaultTipPercent);
  const [customTip, setCustomTip] = useState<string>("");
  const [stage, setStage] = useState<Stage>("review");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(
    () => totalsFor(data.items, zipCode, tipPercent),
    [data.items, zipCode, tipPercent]
  );

  function pickPreset(n: number) {
    setTipPercent(n);
    setCustomTip("");
  }

  function applyCustom() {
    const n = Number(customTip);
    if (!Number.isFinite(n) || n < 0 || n > 50) return;
    setTipPercent(n);
  }

  async function continueToPay() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${data.sessionId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipPercent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      if (!body.clientSecret) throw new Error("Stripe did not return a client secret");
      setClientSecret(body.clientSecret);
      setStage("pay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setCreating(false);
    }
  }

  if (stage === "pay" && clientSecret) {
    if (!PUBLISHABLE_KEY) {
      return (
        <ErrorPanel
          title="Stripe is not configured"
          body="NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. Paste it into .env.local and restart the dev server."
        />
      );
    }
    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/v/${slug}/t/${encodeURIComponent(data.tableLabel)}/feedback`
        : `/v/${slug}/t/${encodeURIComponent(data.tableLabel)}/feedback`;
    return (
      <Elements
        stripe={getStripe()}
        options={{ clientSecret, appearance: { theme: "stripe" } }}
      >
        <PayForm
          totalCents={totals.totalCents}
          returnUrl={returnUrl}
          onBack={() => {
            setStage("review");
            setClientSecret(null);
          }}
        />
      </Elements>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {data.items.length === 0 ? (
          <li className="px-4 py-3 text-sm text-slate-500">No items on this tab yet.</li>
        ) : (
          data.items.map((it, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{it.quantity > 1 ? `${it.quantity}× ` : ""}{it.name}</span>
              <span className="font-mono">{dollars(it.quantity * it.unitCents)}</span>
            </li>
          ))
        )}
      </ul>

      <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <Row label="Subtotal" value={dollars(totals.subtotalCents)} />
        <Row label="Tax" value={dollars(totals.taxCents)} />
        <Row label={`Tip (${tipPercent}%)`} value={dollars(totals.tipCents)} />
        <Row label="Total" value={dollars(totals.totalCents)} bold />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Tip</p>
        <div className="grid grid-cols-4 gap-2">
          {TIP_PRESETS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => pickPreset(p)}
              className={[
                "rounded-lg border px-3 py-3 text-sm font-medium",
                tipPercent === p && customTip === "" ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700",
              ].join(" ")}
            >
              {p}%
            </button>
          ))}
          <input
            type="number"
            min={0}
            max={50}
            step={1}
            inputMode="numeric"
            placeholder="custom"
            value={customTip}
            onChange={e => setCustomTip(e.target.value)}
            onBlur={applyCustom}
            className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-center text-sm"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={continueToPay}
        disabled={creating || totals.totalCents <= 0}
        className="w-full rounded-xl bg-brand py-4 text-base font-semibold text-white disabled:opacity-60"
      >
        {creating ? "Preparing payment…" : `Continue · ${dollars(totals.totalCents)}`}
      </button>
    </div>
  );
}

function PayForm({
  totalCents,
  returnUrl,
  onBack,
}: {
  totalCents: number;
  returnUrl: string;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (stripe && elements) setReady(true);
  }, [stripe, elements]);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    if (result.error) {
      setError(result.error.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }
    // Payment succeeded without redirect (e.g. card without 3DS).
    // Webhook will mark the session paid; navigate the guest forward.
    window.location.href = returnUrl;
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={!ready || submitting}
        className="w-full rounded-xl bg-brand py-4 text-base font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Charging…" : `Pay ${dollars(totalCents)}`}
      </button>
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
      >
        Back · change tip
      </button>
    </form>
  );
}

function ErrorPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-red-50 p-6">
      <p className="text-sm font-semibold text-red-900">{title}</p>
      <p className="mt-1 text-sm text-red-800">{body}</p>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={["flex items-center justify-between py-1", bold ? "font-semibold text-slate-900" : "text-slate-600"].join(" ")}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
