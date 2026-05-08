"use client";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { dollars } from "@/lib/bill";

type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  categoryName: string;
  ageRestricted: boolean;
  description: string | null;
};

type Props = {
  slug: string;
  items: MenuItem[];
  venueName: string;
};

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe() {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

type Stage = "browse" | "review" | "pay";

export function OrderScreen({ slug, items, venueName }: Props) {
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [stage, setStage] = useState<Stage>("browse");
  const [tip, setTip] = useState(20);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [preOrderId, setPreOrderId] = useState<string | null>(null);

  const itemsById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const it of items) {
      const k = it.categoryName || "Other";
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  const lineCount = Array.from(cart.values()).reduce((s, n) => s + n, 0);
  const subtotalCents = Array.from(cart.entries()).reduce((s, [id, qty]) => {
    const i = itemsById.get(id);
    return s + (i ? i.priceCents * qty : 0);
  }, 0);
  const tipCents = Math.round(subtotalCents * (tip / 100));
  const totalCents = subtotalCents + tipCents;

  function setQty(id: string, qty: number) {
    setCart(prev => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }

  async function placeOrder() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v/${slug}/preorders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: Array.from(cart.entries()).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
          guestName: name || undefined,
          tipPercent: tip,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setClientSecret(body.clientSecret);
      setPickupCode(body.pickupCode);
      setPreOrderId(body.preOrderId);
      setStage("pay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place order");
    } finally {
      setCreating(false);
    }
  }

  if (stage === "pay" && clientSecret && pickupCode && preOrderId) {
    return (
      <Elements
        stripe={getStripe()}
        options={{ clientSecret, appearance: { theme: "stripe" } }}
      >
        <PayForm
          totalCents={totalCents}
          slug={slug}
          preOrderId={preOrderId}
          pickupCode={pickupCode}
          venueName={venueName}
        />
      </Elements>
    );
  }

  if (stage === "review") {
    return (
      <div className="space-y-5">
        <header>
          <h2 className="text-base font-medium">Your order</h2>
          <button onClick={() => setStage("browse")} className="text-xs text-umber underline-offset-4 hover:underline">
            ← keep browsing
          </button>
        </header>
        <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
          {Array.from(cart.entries()).map(([id, qty]) => {
            const it = itemsById.get(id)!;
            return (
              <li key={id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="text-slate/50">{qty}× </span>
                  {it.name}
                </span>
                <span className="font-mono text-xs">{dollars(it.priceCents * qty)}</span>
              </li>
            );
          })}
        </ul>

        <section className="rounded-2xl border border-slate/10 bg-white p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Name (for pickup)</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="So we can call you"
            className="mt-2 w-full rounded-xl border border-slate/15 px-3 py-2 text-sm focus:border-sea focus:outline-none"
            maxLength={120}
          />
        </section>

        <section className="rounded-2xl border border-slate/10 bg-white p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Tip</p>
          <div className="mt-2 flex gap-2">
            {[15, 20, 25].map(n => (
              <button
                key={n}
                onClick={() => setTip(n)}
                className={[
                  "rounded-full border px-3 py-1 text-xs",
                  n === tip ? "border-slate bg-slate text-oat" : "border-slate/15 text-slate/70 hover:border-slate/40",
                ].join(" ")}
              >
                {n}%
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate/70">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{dollars(subtotalCents)}</span></div>
            <div className="flex justify-between"><span>Tip</span><span className="font-mono">{dollars(tipCents)}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate/10 pt-1 font-medium text-slate"><span>Total</span><span className="font-mono">{dollars(totalCents)}</span></div>
          </div>
        </section>

        {error ? (
          <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</p>
        ) : null}

        <button
          onClick={placeOrder}
          disabled={creating || subtotalCents <= 0}
          className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
        >
          {creating ? "Preparing payment…" : `Continue · ${dollars(totalCents)}`}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([cat, list]) => (
        <section key={cat}>
          {cat ? <h2 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-umber">{cat}</h2> : null}
          <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
            {list.map(it => {
              const qty = cart.get(it.id) ?? 0;
              return (
                <li key={it.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{it.name}</span>
                      {it.ageRestricted ? <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">21+</span> : null}
                    </div>
                    {it.description ? <p className="mt-1 text-[11px] text-slate/60">{it.description}</p> : null}
                  </div>
                  <span className="ml-3 font-mono text-xs">{dollars(it.priceCents)}</span>
                  <div className="ml-3 flex items-center gap-2">
                    <button
                      onClick={() => setQty(it.id, Math.max(0, qty - 1))}
                      disabled={qty === 0}
                      className="h-7 w-7 rounded-full border border-slate/15 disabled:opacity-30"
                    >−</button>
                    <span className="w-4 text-center text-xs tabular-nums">{qty}</span>
                    <button
                      onClick={() => setQty(it.id, qty + 1)}
                      className="h-7 w-7 rounded-full border border-slate/15"
                    >+</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {lineCount > 0 ? (
        <div className="sticky bottom-4 z-10">
          <button
            onClick={() => setStage("review")}
            className="w-full rounded-xl bg-slate py-4 text-base font-medium text-oat shadow-lg"
          >
            Review · {lineCount} item{lineCount === 1 ? "" : "s"} · {dollars(subtotalCents)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PayForm({
  totalCents,
  slug,
  preOrderId,
  pickupCode,
  venueName,
}: {
  totalCents: number;
  slug: string;
  preOrderId: string;
  pickupCode: string;
  venueName: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/v/${slug}/order/${preOrderId}?code=${pickupCode}`
        : `/v/${slug}/order/${preOrderId}?code=${pickupCode}`;
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }
    window.location.href = returnUrl;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <header className="rounded-2xl border border-slate/10 bg-white p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{venueName}</p>
        <p className="mt-1 text-2xl font-medium">Pay {dollars(totalCents)}</p>
        <p className="mt-1 text-xs text-slate/60">Pickup code: {pickupCode}</p>
      </header>
      <div className="rounded-2xl border border-slate/10 bg-white p-5">
        <PaymentElement />
      </div>
      {error ? <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</p> : null}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting ? "Charging…" : `Pay ${dollars(totalCents)}`}
      </button>
    </form>
  );
}
