"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe() {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

type Props = {
  clientSecret: string;
  returnUrl: string;
};

export function PayScreen({ clientSecret, returnUrl }: Props) {
  if (!PUBLISHABLE_KEY) {
    return (
      <ErrorPanel
        title="Stripe is not configured"
        body="NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. Paste it into .env.local and restart the dev server."
      />
    );
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{ clientSecret, appearance: { theme: "stripe" } }}
    >
      <PayForm returnUrl={returnUrl} />
    </Elements>
  );
}

function PayForm({ returnUrl }: { returnUrl: string }) {
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
    // Succeeded without redirect — webhook will mark the split paid.
    window.location.href = returnUrl;
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <div className="rounded-2xl border border-slate/10 bg-white p-5">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!ready || submitting}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting ? "Charging…" : "Pay now"}
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
