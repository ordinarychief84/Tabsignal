"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// V2 Orders queue panel. Mirrors the live-requests page interaction model:
// tabs across the top, polling every 5s, optimistic action buttons. Action
// validation lives in /api/admin/v/[slug]/orders/[id] — this panel just
// pings the right verb and re-loads.

export type OrderItem = {
  id: string;
  nameSnapshot: string;
  priceCents: number;
  quantity: number;
  notes: string | null;
  status: "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
};

export type AdminOrder = {
  id: string;
  status: "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  tableLabel: string | null;
  subtotalCents: number;
  totalCents: number;
  itemCount: number;
  createdAt: string;
  billId: string | null;
  billStatus: string | null;
  items: OrderItem[];
};

type Tab = "all" | "open" | "preparing" | "ready" | "completed";

const TAB_ORDER: { id: Tab; label: string }[] = [
  { id: "all",        label: "All"        },
  { id: "open",       label: "Open"       },
  { id: "preparing",  label: "Preparing"  },
  { id: "ready",      label: "Ready"      },
  { id: "completed",  label: "Completed"  },
];

const POLL_INTERVAL_MS = 5_000;

function dollars(cents: number): string {
  if (cents < 0) return `−$${(Math.abs(cents) / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function bucketFor(o: AdminOrder): Exclude<Tab, "all"> {
  if (o.status === "NEW" || o.status === "ACCEPTED") return "open";
  if (o.status === "PREPARING") return "preparing";
  if (o.status === "READY") return "ready";
  return "completed";
}

export function OrdersPanel({
  slug,
  initial,
}: {
  slug: string;
  initial: AdminOrder[];
}) {
  const [orders, setOrders] = useState<AdminOrder[]>(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/v/${slug}/orders`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setOrders(body.orders as AdminOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [slug]);

  useEffect(() => {
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  const patch = useCallback(
    async (id: string, status: AdminOrder["status"]) => {
      setPendingId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/v/${slug}/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setPendingId(null);
      }
    },
    [slug, load]
  );

  const filtered = useMemo(() => {
    if (tab === "all") return orders;
    return orders.filter(o => bucketFor(o) === tab);
  }, [orders, tab]);

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</p>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto">
        {TAB_ORDER.map(t => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors",
                active
                  ? "bg-slate text-oat"
                  : "border border-slate/10 bg-white text-slate/70 hover:bg-slate/5",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-slate/10 bg-white px-5 py-8 text-center text-sm text-slate/50">
          No orders in this bucket.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(o => (
            <OrderRow
              key={o.id}
              order={o}
              pending={pendingId === o.id}
              onPatch={status => patch(o.id, status)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function statusBadge(status: AdminOrder["status"]) {
  switch (status) {
    case "NEW":       return { label: "New",       cls: "bg-chartreuse/30 text-slate" };
    case "ACCEPTED":  return { label: "Accepted",  cls: "bg-sea/20 text-slate" };
    case "PREPARING": return { label: "Preparing", cls: "bg-umber/20 text-umber" };
    case "READY":     return { label: "Ready",     cls: "bg-coral/20 text-coral" };
    case "SERVED":    return { label: "Served",    cls: "bg-slate/10 text-slate/60" };
    case "CANCELLED": return { label: "Cancelled", cls: "bg-slate/10 text-slate/40 line-through" };
  }
}

function OrderRow({
  order,
  pending,
  onPatch,
}: {
  order: AdminOrder;
  pending: boolean;
  onPatch: (status: AdminOrder["status"]) => void;
}) {
  const badge = statusBadge(order.status);
  const nextActions: { label: string; status: AdminOrder["status"]; tone: "primary" | "secondary" | "danger" }[] = [];
  if (order.status === "NEW")       nextActions.push({ label: "Accept",     status: "ACCEPTED",  tone: "primary" });
  if (order.status === "ACCEPTED")  nextActions.push({ label: "Preparing",  status: "PREPARING", tone: "primary" });
  if (order.status === "PREPARING") nextActions.push({ label: "Mark ready", status: "READY",     tone: "primary" });
  if (order.status === "READY")     nextActions.push({ label: "Mark served", status: "SERVED",   tone: "primary" });
  if (order.status !== "SERVED" && order.status !== "CANCELLED") {
    nextActions.push({ label: "Cancel", status: "CANCELLED", tone: "danger" });
  }

  return (
    <li className="rounded-2xl border border-slate/10 bg-white px-5 py-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm text-slate/40">#{order.id.slice(-6)}</span>
          <span className="text-sm text-slate">
            {order.tableLabel ? `Table ${order.tableLabel}` : "No table"}
          </span>
          <span className={["rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider", badge.cls].join(" ")}>
            {badge.label}
          </span>
          {order.billStatus ? (
            <span className="rounded-full bg-slate/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate/50">
              Bill {order.billStatus}
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-mono text-sm tabular-nums text-slate">{dollars(order.totalCents)}</p>
          <p className="text-[11px] text-slate/40">
            {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · {fmtTime(order.createdAt)}
          </p>
        </div>
      </header>

      <ul className="mt-3 space-y-1 text-sm">
        {order.items.map(i => (
          <li key={i.id} className="text-slate/80">
            <span className="text-slate/40">{i.quantity}× </span>
            {i.nameSnapshot}
            {i.notes ? <span className="ml-2 text-[11px] text-umber">— {i.notes}</span> : null}
          </li>
        ))}
      </ul>

      {nextActions.length > 0 ? (
        <footer className="mt-4 flex flex-wrap gap-2">
          {nextActions.map(a => (
            <button
              key={a.status}
              type="button"
              disabled={pending}
              onClick={() => onPatch(a.status)}
              className={[
                "rounded-full px-4 py-1.5 text-sm transition-colors disabled:opacity-50",
                a.tone === "primary"
                  ? "bg-slate text-oat hover:bg-slate/90"
                  : a.tone === "danger"
                  ? "border border-coral/40 bg-white text-coral hover:bg-coral/5"
                  : "border border-slate/10 bg-white text-slate hover:bg-slate/5",
              ].join(" ")}
            >
              {a.label}
            </button>
          ))}
        </footer>
      ) : null}
    </li>
  );
}
