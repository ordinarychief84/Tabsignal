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
  sessionToken: string;
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
        body: JSON.stringify({ tipPercent, sessionToken: data.sessionToken }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Venue's Stripe Connect onboarding isn't done — Stripe would
        // reject the PaymentIntent. Surface a friendly "ask staff" panel
        // instead of the raw API error code.
        if (res.status === 503 && body?.error === "VENUE_NOT_READY") {
          throw new Error("VENUE_NOT_READY");
        }
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      if (!body.clientSecret) throw new Error("Stripe did not return a client secret");
      setClientSecret(body.clientSecret);
      setStage("pay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setCreating(false);
    }
  }

  if (error === "VENUE_NOT_READY") {
    return (
      <ErrorPanel
        title="Pay your tab in person tonight"
        body="This venue is still setting up card payments. Flag your server — they'll close out your tab with the usual reader or POS. Sorry for the bump."
      />
    );
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
    const tokenSegment = `?s=${encodeURIComponent(data.sessionToken)}`;
    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/v/${slug}/t/${encodeURIComponent(data.tableLabel)}/feedback${tokenSegment}`
        : `/v/${slug}/t/${encodeURIComponent(data.tableLabel)}/feedback${tokenSegment}`;
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
      <div className="rounded-2xl border border-slate/10 bg-white">
        <div className="border-b border-slate/10 px-5 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Items</p>
        </div>
        <ul className="divide-y divide-slate/5">
          {data.items.length === 0 ? (
            <li className="px-5 py-5 text-sm text-slate/50">
              No items on this tab yet. Your server will add them.
            </li>
          ) : (
            data.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {it.quantity > 1 ? <span className="text-slate/50">{it.quantity}× </span> : null}
                  {it.name}
                </span>
                <span className="font-mono tabular-nums">{dollars(it.quantity * it.unitCents)}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white px-5 py-4">
        <Row label="Subtotal" value={dollars(totals.subtotalCents)} />
        <Row label="Tax" value={dollars(totals.taxCents)} />
        <Row label={`Tip · ${tipPercent}%`} value={dollars(totals.tipCents)} />
        <div className="mt-2 border-t border-slate/10 pt-2">
          <Row label="Total" value={dollars(totals.totalCents)} bold />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Tip</p>
        <p className="mt-1 text-[11px] text-slate/50">100% goes to staff.</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {TIP_PRESETS.map(p => {
            const active = tipPercent === p && customTip === "";
            const dollarsForP = Math.round(totals.subtotalCents * (p / 100));
            return (
              <button
                key={p}
                type="button"
                onClick={() => pickPreset(p)}
                className={[
                  "flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-sm transition-colors",
                  active ? "border-slate bg-slate text-oat" : "border-slate/15 bg-white text-slate hover:border-slate/30",
                ].join(" ")}
              >
                <span className="font-medium">{p}%</span>
                <span className={["mt-0.5 font-mono text-[10px] tabular-nums", active ? "text-oat/60" : "text-slate/40"].join(" ")}>
                  {dollars(dollarsForP)}
                </span>
              </button>
            );
          })}
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
            className="rounded-xl border border-slate/15 bg-white px-3 py-3 text-center text-sm text-slate placeholder-slate/30 focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={continueToPay}
        disabled={creating || totals.totalCents <= 0}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {creating ? "Preparing payment…" : `Continue · ${dollars(totals.totalCents)}`}
      </button>

      <a
        href={`/v/${slug}/t/${encodeURIComponent(data.tableLabel)}/bill/split?s=${encodeURIComponent(data.sessionToken)}`}
        className="block w-full rounded-xl border border-slate/15 bg-white py-3 text-center text-sm font-medium text-slate/70 hover:border-slate/30"
      >
        Split this bill
      </a>

      <p className="text-center text-[11px] text-slate/40">
        Encrypted by Stripe. Apple Pay and Google Pay supported.
      </p>
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
      <div className="rounded-2xl border border-slate/10 bg-white p-5">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={!ready || submitting}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting ? "Charging…" : `Pay ${dollars(totalCents)}`}
      </button>
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="w-full rounded-xl border border-slate/15 bg-white py-3 text-sm font-medium text-slate/70 hover:border-slate/30 disabled:opacity-60"
      >
        ← back · change tip
      </button>
    </form>
  );
}

function ErrorPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-coral/40 bg-coral/15 p-6">
      <p className="text-sm font-medium text-coral">{title}</p>
      <p className="mt-1 text-sm text-slate/70">{body}</p>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={["flex items-center justify-between py-1", bold ? "font-medium text-slate" : "text-slate/65"].join(" ")}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
