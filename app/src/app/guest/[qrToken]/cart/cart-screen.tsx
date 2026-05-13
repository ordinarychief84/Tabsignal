"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { dollars } from "@/lib/bill";

type CartLine = {
  menuItemId: string;
  name: string;
  unitCents: number;
  quantity: number;
  note?: string | null;
};

type Props = {
  qrToken: string;
  slug: string;
  sessionId: string;
  sessionToken: string;
  venueName: string;
  tableLabel: string;
};

// localStorage key — scoped by sessionToken so distinct guests / sessions
// don't bleed cart state into each other on shared devices.
function cartKey(sessionToken: string) {
  return `tabcall:guest-cart:${sessionToken}`;
}

function safeReadCart(sessionToken: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cartKey(sessionToken));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CartLine =>
        x &&
        typeof x.menuItemId === "string" &&
        typeof x.name === "string" &&
        Number.isInteger(x.unitCents) &&
        Number.isInteger(x.quantity) &&
        x.quantity > 0,
    );
  } catch {
    return [];
  }
}

function writeCart(sessionToken: string, lines: CartLine[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cartKey(sessionToken), JSON.stringify(lines));
  } catch {
    /* quota or disabled — silent */
  }
}

export function CartScreen({
  qrToken,
  slug,
  sessionId,
  sessionToken,
  tableLabel,
}: Props) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  useEffect(() => {
    setLines(safeReadCart(sessionToken));
    setHydrated(true);
  }, [sessionToken]);

  const subtotalCents = useMemo(
    () => lines.reduce((s, l) => s + l.unitCents * l.quantity, 0),
    [lines],
  );

  function updateQty(menuItemId: string, delta: number) {
    setLines(prev => {
      const next = prev
        .map(l =>
          l.menuItemId === menuItemId
            ? { ...l, quantity: Math.max(0, l.quantity + delta) }
            : l,
        )
        .filter(l => l.quantity > 0);
      writeCart(sessionToken, next);
      return next;
    });
  }

  function removeLine(menuItemId: string) {
    setLines(prev => {
      const next = prev.filter(l => l.menuItemId !== menuItemId);
      writeCart(sessionToken, next);
      return next;
    });
  }

  async function placeOrder() {
    if (lines.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v/${slug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          items: lines.map(l => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            note: l.note ?? undefined,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? body?.detail ?? `HTTP ${res.status}`);
      }
      // Clear cart on success.
      writeCart(sessionToken, []);
      setLines([]);
      setPlacedOrderId(body?.id ?? body?.orderId ?? "ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place order");
    } finally {
      setSubmitting(false);
    }
  }

  if (placedOrderId) {
    return (
      <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-6 text-center">
        <p className="text-3xl">·</p>
        <h2 className="mt-3 text-xl font-medium">Order placed</h2>
        <p className="mt-2 text-sm text-slate/65">
          The kitchen and your server have been notified. Watch this tab.
          Your bill will update as items are fired.
        </p>
        <div className="mt-5 flex flex-col items-center gap-2">
          <Link
            href={`/guest/${encodeURIComponent(qrToken)}/bill`}
            className="rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
          >
            View bill →
          </Link>
          <Link
            href={`/guest/${encodeURIComponent(qrToken)}/menu`}
            className="text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
          >
            Order more
          </Link>
        </div>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <p className="rounded-lg border border-slate/10 bg-white px-5 py-8 text-center text-sm text-slate/50">
        Loading your cart…
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-slate/10 bg-white p-6 text-center">
        <p className="text-3xl">·</p>
        <h2 className="mt-3 text-base font-medium">Your cart is empty</h2>
        <p className="mt-2 text-sm text-slate/60">
          Browse the menu to add items.
        </p>
        <div className="mt-5 flex flex-col items-center gap-2">
          <Link
            href={`/guest/${encodeURIComponent(qrToken)}/menu`}
            className="rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
          >
            Browse menu →
          </Link>
          <Link
            href={`/guest/${encodeURIComponent(qrToken)}`}
            className="text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
          >
            ← back to {tableLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
        {lines.map(line => (
          <li key={line.menuItemId} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{line.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate/55">
                  {dollars(line.unitCents)} each
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums">
                {dollars(line.unitCents * line.quantity)}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="inline-flex items-center gap-3 rounded-full border border-slate/15 bg-white px-2 py-1">
                <button
                  type="button"
                  onClick={() => updateQty(line.menuItemId, -1)}
                  className="h-7 w-7 rounded-full text-base text-slate hover:bg-slate/5"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="min-w-[1.5rem] text-center font-mono text-sm tabular-nums">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQty(line.menuItemId, 1)}
                  className="h-7 w-7 rounded-full text-base text-slate hover:bg-slate/5"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeLine(line.menuItemId)}
                className="text-[11px] uppercase tracking-wider text-slate/45 hover:text-coral"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-slate/10 bg-white px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate/65">Subtotal</span>
          <span className="font-mono tabular-nums">
            {dollars(subtotalCents)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate/40">
          Tax and tip calculated at checkout.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={placeOrder}
        disabled={submitting}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting ? "Placing order…" : `Place order · ${dollars(subtotalCents)}`}
      </button>

      <Link
        href={`/guest/${encodeURIComponent(qrToken)}/menu`}
        className="block text-center text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
      >
        ← keep browsing
      </Link>
    </div>
  );
}
