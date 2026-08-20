"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Badge, EmptyState } from "@/components/admin/ui";

/**
 * The counter queue.
 *
 * Designed around the one question someone behind a counter actually
 * asks: "a guest is standing here showing me a code — which order is
 * that, and is it ready?" So the pickup code is the largest thing on
 * every row, monospaced and letter-spaced to be read off a phone screen
 * at arm's length, and the queue sorts oldest-first because that is the
 * order people are waiting in.
 *
 * Polls every 5s, matching the cadence the API was written for. There is
 * no socket channel for pre-orders — adding one would mean a new realtime
 * event type for a queue that turns over slowly, so polling is the honest
 * fit rather than the lazy one.
 */

type Item = { name?: string; quantity?: number; unitCents?: number };

type PreOrder = {
  id: string;
  status: "PENDING" | "READY" | "PICKED_UP" | "CANCELED";
  pickupCode: string;
  items: unknown;
  totalCents: number;
  tipCents: number;
  guestName: string | null;
  tableLabel: string | null;
  paidAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  createdAt: string;
};

const POLL_MS = 5_000;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function waitingFor(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

function parseItems(raw: unknown): Item[] {
  return Array.isArray(raw) ? (raw as Item[]) : [];
}

export function PreOrdersPanel({ slug }: { slug: string }) {
  const [orders, setOrders] = useState<PreOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/v/${slug}/preorders`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setOrders(body.orders ?? []);
      setError(null);
    } catch {
      // A dropped poll shouldn't blank a queue someone is working from —
      // keep the last good list and let the next tick recover.
      setError("Live updates interrupted — retrying.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function setStatus(id: string, status: "READY" | "PICKED_UP" | "CANCELED") {
    if (pending) return;
    setPending(id);
    const before = orders;
    // Optimistic: the counter is a fast-moving place and a 300ms wait
    // between tapping "Ready" and the row moving reads as a dropped tap.
    setOrders(curr => curr?.map(o => (o.id === id ? { ...o, status } : o)) ?? curr);
    try {
      const res = await fetch(`/api/admin/v/${slug}/preorders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setOrders(before ?? null);
      setError(e instanceof Error ? e.message : "Couldn't update that order");
    } finally {
      setPending(null);
    }
  }

  if (orders === null) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading pre-orders…</span>
        {[0, 1, 2].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate/5" />
        ))}
      </div>
    );
  }

  // Oldest first — the person who has waited longest is served first.
  const waiting = orders
    .filter(o => o.status === "PENDING" || o.status === "READY")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const done = orders.filter(o => o.status === "PICKED_UP" || o.status === "CANCELED");

  return (
    <div className="space-y-6">
      {error ? (
        <p role="status" className="rounded-lg border border-umber-soft/40 bg-white px-4 py-2.5 text-sm text-slate/60">
          {error}
        </p>
      ) : null}

      {waiting.length === 0 ? (
        <EmptyState
          title="No pre-orders waiting"
          body="Paid pre-orders land here the moment a guest checks out. The queue refreshes on its own."
        />
      ) : (
        <ul className="space-y-3">
          {waiting.map(o => {
            const items = parseItems(o.items);
            const ready = o.status === "READY";
            return (
              <li
                key={o.id}
                className="rounded-2xl border border-slate/10 bg-white p-5 transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      {/* The whole point of the screen. */}
                      <span className="font-mono text-2xl font-semibold tracking-[0.18em] text-slate">
                        {o.pickupCode}
                      </span>
                      <Badge tone={ready ? "green" : "amber"}>{ready ? "Ready" : "Preparing"}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-slate/60">
                      {o.guestName ?? "Guest"}
                      {o.tableLabel ? ` · ${o.tableLabel}` : ""} · ordered {waitingFor(o.createdAt)}
                    </p>
                    {items.length > 0 ? (
                      <ul className="mt-3 space-y-0.5 text-sm text-slate/75">
                        {items.map((it, i) => (
                          <li key={i}>
                            {it.quantity && it.quantity > 1 ? `${it.quantity}× ` : ""}
                            {it.name ?? "Item"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="font-mono text-sm text-slate">
                      {money(o.totalCents)}
                      {o.tipCents > 0 ? (
                        <span className="text-slate/45"> · {money(o.tipCents)} tip</span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!ready ? (
                        <button
                          type="button"
                          disabled={pending === o.id}
                          onClick={() => setStatus(o.id, "READY")}
                          className="rounded-full bg-slate px-3.5 py-1.5 text-xs font-medium text-oat hover:bg-slate/90 disabled:opacity-50"
                        >
                          Mark ready
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending === o.id}
                          onClick={() => setStatus(o.id, "PICKED_UP")}
                          className="rounded-full bg-chartreuse px-3.5 py-1.5 text-xs font-medium text-slate hover:opacity-90 disabled:opacity-50"
                        >
                          Handed over
                        </button>
                      )}
                      <ConfirmButton
                        onConfirm={() => setStatus(o.id, "CANCELED")}
                        disabled={pending === o.id}
                        title={`Cancel pre-order ${o.pickupCode}?`}
                        body="The guest has already paid. Cancelling here does not refund them — issue the refund in Stripe as well."
                        confirmLabel="Cancel order"
                        className="rounded-full border border-coral/30 px-3.5 py-1.5 text-xs font-medium text-coral hover:bg-coral/5 disabled:opacity-50"
                      >
                        Cancel
                      </ConfirmButton>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-umber">
            Closed out · last hour
          </h2>
          <ul className="divide-y divide-slate/5 overflow-hidden rounded-2xl border border-slate/10 bg-white">
            {done.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="font-mono tracking-[0.14em] text-slate/50">{o.pickupCode}</span>
                <span className="text-slate/45">
                  {o.status === "CANCELED" ? "Cancelled" : "Picked up"}
                  {o.pickedUpAt ? ` · ${waitingFor(o.pickedUpAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
