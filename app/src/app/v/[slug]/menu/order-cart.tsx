"use client";

/**
 * DEPRECATED — the guest ordering cart.
 *
 * Superseded by My Picks plus a "ready to order" signal: a shortlist the
 * guest talks through with their server, rather than an order TabCall
 * submits. Left in place because the browse-only /v/[slug]/menu page still
 * imports it and the Order tables still hold real rows; it is not part of
 * the table-scanned guest journey.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Guest ordering from the menu.
 *
 * Split into a provider plus a per-row stepper plus a sticky bar so the
 * server component can keep rendering the menu (categories, badges,
 * promotions, wishlist hearts) and only the ordering bits are client-side.
 *
 * Only mounts when the guest arrived from a table QR — a public browser
 * with no session has nowhere to send an order, so they see prices and
 * nothing else.
 */

type CartLine = { menuItemId: string; name: string; priceCents: number; quantity: number };
type CartState = {
  lines: Map<string, CartLine>;
  add: (item: { id: string; name: string; priceCents: number }) => void;
  remove: (menuItemId: string) => void;
};

const CartContext = createContext<CartState | null>(null);

export function OrderCartProvider({
  slug,
  sessionId,
  sessionToken,
  tableLabel,
  children,
}: {
  slug: string;
  sessionId: string;
  sessionToken: string;
  tableLabel: string | null;
  children: React.ReactNode;
}) {
  const [lines, setLines] = useState<Map<string, CartLine>>(new Map());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback((item: { id: string; name: string; priceCents: number }) => {
    setError(null);
    setLines(curr => {
      const next = new Map(curr);
      const existing = next.get(item.id);
      next.set(item.id, {
        menuItemId: item.id,
        name: item.name,
        priceCents: item.priceCents,
        quantity: Math.min(20, (existing?.quantity ?? 0) + 1),
      });
      return next;
    });
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(6);
    } catch { /* iOS Safari */ }
  }, []);

  const remove = useCallback((menuItemId: string) => {
    setLines(curr => {
      const next = new Map(curr);
      const existing = next.get(menuItemId);
      if (!existing) return curr;
      if (existing.quantity <= 1) next.delete(menuItemId);
      else next.set(menuItemId, { ...existing, quantity: existing.quantity - 1 });
      return next;
    });
  }, []);

  const list = [...lines.values()];
  const itemCount = list.reduce((n, l) => n + l.quantity, 0);
  const totalCents = list.reduce((n, l) => n + l.quantity * l.priceCents, 0);

  async function send() {
    if (sending || list.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v/${slug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          // Ids and quantities only — the server prices it.
          items: list.map(l => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(humanError(body?.error, body?.detail));
      setSent(itemCount);
      setLines(new Map());
      setTimeout(() => setSent(null), 6_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that order");
    } finally {
      setSending(false);
    }
  }

  const value = useMemo<CartState>(() => ({ lines, add, remove }), [lines, add, remove]);

  return (
    <CartContext.Provider value={value}>
      {/* Bottom padding so the sticky bar never covers the last menu row. */}
      <div className={itemCount > 0 || sent !== null ? "pb-32" : undefined}>{children}</div>

      {sent !== null ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-chartreuse/40 bg-chartreuse/90 px-6 py-4 text-center backdrop-blur"
        >
          <p className="text-sm font-medium text-slate">
            Order sent — {sent} {sent === 1 ? "item" : "items"} on the way
          </p>
          <p className="mt-0.5 text-[12px] text-slate/70">
            It&rsquo;s on your tab. Settle with your server when you&rsquo;re ready.
          </p>
        </div>
      ) : itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate/10 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate">
                {itemCount} {itemCount === 1 ? "item" : "items"} · {dollars(totalCents)}
              </p>
              <p className="truncate text-[11px] text-slate/55">
                {list.map(l => `${l.quantity}× ${l.name}`).join(", ")}
              </p>
            </div>
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="shrink-0 rounded-full bg-slate px-5 py-2.5 text-sm font-medium text-oat transition-transform active:scale-95 disabled:opacity-60"
            >
              {sending ? "Sending…" : tableLabel ? `Send to ${tableLabel}` : "Send order"}
            </button>
          </div>
          {error ? (
            <p role="alert" className="mx-auto mt-2 max-w-md text-center text-[12px] text-coral">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </CartContext.Provider>
  );
}

/** Per-item stepper. Renders nothing when there's no cart in scope. */
export function AddToOrder({
  id,
  name,
  priceCents,
}: {
  id: string;
  name: string;
  priceCents: number;
}) {
  const cart = useContext(CartContext);
  if (!cart) return null;
  const qty = cart.lines.get(id)?.quantity ?? 0;

  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={() => cart.add({ id, name, priceCents })}
        aria-label={`Add ${name} to your order`}
        className="rounded-full border border-slate/20 px-3 py-1 text-[12px] font-medium text-slate transition-colors hover:bg-slate hover:text-oat"
      >
        Add
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => cart.remove(id)}
        aria-label={`Remove one ${name}`}
        className="h-7 w-7 rounded-full border border-slate/20 text-sm leading-none text-slate hover:bg-slate/5"
      >
        −
      </button>
      <span aria-live="polite" className="min-w-[1.25rem] text-center font-mono text-sm tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => cart.add({ id, name, priceCents })}
        aria-label={`Add another ${name}`}
        className="h-7 w-7 rounded-full border border-slate/20 text-sm leading-none text-slate hover:bg-slate/5"
      >
        +
      </button>
    </span>
  );
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function humanError(code: unknown, detail?: string): string {
  switch (code) {
    case "RATE_LIMITED":   return "Just a moment — that order is already on its way.";
    case "SESSION_EXPIRED": return "This table session expired. Re-scan the QR to start a new one.";
    case "SESSION_CLOSED":  return "This tab is closed. Re-scan the QR to open a fresh one.";
    case "INVALID_ITEMS":   return detail ?? "Something on your order is no longer available.";
    default:                return "Couldn't send that order. Flag your server and they'll sort it.";
  }
}
