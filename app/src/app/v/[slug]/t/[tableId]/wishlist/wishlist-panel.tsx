"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type WishlistItem = {
  id: string;
  quantity: number;
  notes: string | null;
  menuItem: {
    id: string;
    name: string;
    priceCents: number;
    imageUrl: string | null;
  };
};

type WishlistShape = {
  id: string;
  status: "ACTIVE" | "CONVERTED" | "CANCELLED";
  sharedWithStaffAt: string | null;
  items: WishlistItem[];
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WishlistPanel({
  slug,
  tableLabel,
  sessionId,
  sessionToken,
}: {
  slug: string;
  tableLabel: string;
  sessionId: string;
  sessionToken: string;
}) {
  const [wishlist, setWishlist] = useState<WishlistShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const refresh = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v/${slug}/wishlist`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        // GET still carries a body in our protocol — Next.js Route
        // Handlers accept it, and we'd rather not leak the session
        // token into query params / referer headers.
        body: JSON.stringify({ sessionId, sessionToken }),
      });
      if (res.status === 404) {
        setWishlist(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setWishlist(body.wishlist);
      setShared(!!body.wishlist?.sharedWithStaffAt);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't load wishlist.");
    } finally {
      setLoading(false);
    }
  }, [slug, sessionId, sessionToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function removeItem(menuItemId: string) {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v/${slug}/wishlist`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sessionToken, menuItemId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't remove item.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v/${slug}/wishlist`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sessionToken }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWishlist(null);
      setShared(false);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't clear wishlist.");
    } finally {
      setBusy(false);
    }
  }

  async function shareWithStaff() {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v/${slug}/wishlist/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sessionToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setShared(true);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't share.");
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v/${slug}/wishlist/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sessionToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      // Conversion marks state only. Send the guest to the menu /
      // bill flow where they can submit a real order.
      window.location.href = `/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill?s=${encodeURIComponent(sessionToken)}`;
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't convert.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="px-6">
        <p className="text-sm text-slate/50">Loading…</p>
      </section>
    );
  }

  if (!wishlist || wishlist.items.length === 0) {
    return (
      <section className="px-6">
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center">
          <p className="text-2xl">♡</p>
          <p className="mt-3 text-sm text-slate/70">
            Browse the menu and tap the heart to save items here.
          </p>
          <Link
            href={`/v/${slug}/menu`}
            className="mt-5 inline-block rounded-lg bg-chartreuse px-4 py-2 text-sm font-medium text-slate"
          >
            Browse menu
          </Link>
        </div>
      </section>
    );
  }

  const subtotalCents = wishlist.items.reduce(
    (s, it) => s + it.menuItem.priceCents * it.quantity,
    0
  );

  return (
    <section className="space-y-4 px-6 pb-8">
      <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
        {wishlist.items.map(it => (
          <li key={it.id} className="flex items-start gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{it.menuItem.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate/60">
                {it.quantity > 1 ? `${it.quantity} × ` : ""}
                {dollars(it.menuItem.priceCents)}
              </p>
              {it.notes ? (
                <p className="mt-1 text-[11px] italic text-slate/60">{it.notes}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => removeItem(it.menuItem.id)}
              className="shrink-0 rounded-md border border-slate/10 px-2 py-1 text-[11px] text-slate/60 hover:text-slate disabled:opacity-50"
              aria-label={`Remove ${it.menuItem.name}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-xl bg-slate/5 px-5 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-umber">
          Subtotal
        </span>
        <span className="font-mono text-sm">{dollars(subtotalCents)}</span>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={convert}
          className="w-full rounded-xl bg-chartreuse py-3 text-sm font-medium text-slate disabled:opacity-60"
        >
          Add to cart
        </button>
        <button
          type="button"
          disabled={busy || shared}
          onClick={shareWithStaff}
          className={[
            "w-full rounded-xl border py-3 text-sm font-medium transition-colors disabled:opacity-60",
            shared
              ? "border-coral/40 bg-coral/15 text-coral"
              : "border-coral bg-coral/10 text-coral hover:bg-coral/20",
          ].join(" ")}
        >
          {shared ? "Shared with waiter" : "Share with waiter"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={clearAll}
          className="w-full rounded-xl border border-slate/10 py-3 text-sm font-medium text-slate/60 hover:text-slate disabled:opacity-60"
        >
          Clear wishlist
        </button>
      </div>

      {errorMsg ? (
        <p className="rounded-lg bg-coral/10 px-3 py-2 text-center text-sm text-coral">
          {errorMsg}
        </p>
      ) : null}
    </section>
  );
}
