"use client";

import { useEffect, useState } from "react";

type Order = {
  id: string;
  status: "PENDING" | "READY" | "PICKED_UP" | "CANCELED";
  pickupCode: string | null;
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

type Line = { menuItemId: string; name: string; quantity: number; unitCents: number };

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseLines(json: unknown): Line[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x: unknown) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.quantity !== "number" || typeof o.unitCents !== "number") return [];
    return [{
      menuItemId: typeof o.menuItemId === "string" ? o.menuItemId : "",
      name: o.name,
      quantity: o.quantity,
      unitCents: o.unitCents,
    }];
  });
}

export function OrdersPanel({ slug }: { slug: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/admin/v/${slug}/preorders`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setOrders(body.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function patch(id: string, status: Order["status"]) {
    try {
      const res = await fetch(`/api/admin/v/${slug}/preorders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  const pending = orders.filter(o => o.status === "PENDING");
  const ready = orders.filter(o => o.status === "READY");
  const done = orders.filter(o => o.status === "PICKED_UP");

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</p>
      ) : null}

      <Section title="Making" empty="No pending orders.">
        {pending.map(o => <Card key={o.id} order={o} action="ready" onAction={() => patch(o.id, "READY")} />)}
      </Section>

      <Section title="Ready for pickup" empty="Nothing ready.">
        {ready.map(o => <Card key={o.id} order={o} action="pickup" onAction={() => patch(o.id, "PICKED_UP")} />)}
      </Section>

      <Section title="Picked up · last hour" empty="—">
        {done.map(o => <Card key={o.id} order={o} action={null} onAction={() => {}} />)}
      </Section>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const visible = arr.filter(Boolean);
  return (
    <section>
      <h2 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-umber">{title}</h2>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-slate/10 bg-white px-5 py-4 text-sm text-slate/50">{empty}</p>
      ) : (
        <div className="space-y-2">{visible}</div>
      )}
    </section>
  );
}

function Card({
  order,
  action,
  onAction,
}: {
  order: Order;
  action: "ready" | "pickup" | null;
  onAction: () => void;
}) {
  const lines = parseLines(order.items);
  return (
    <article className="rounded-2xl border border-slate/10 bg-white p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="font-mono text-2xl tracking-widest">{order.pickupCode}</p>
          <p className="text-xs text-slate/50">
            {order.guestName ?? "(no name)"} · {dollars(order.totalCents)}
          </p>
        </div>
        {action === "ready" ? (
          <button onClick={onAction} className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90">
            Mark ready
          </button>
        ) : null}
        {action === "pickup" ? (
          <button onClick={onAction} className="rounded-full bg-chartreuse px-4 py-1.5 text-sm text-slate hover:bg-chartreuse/80">
            Picked up
          </button>
        ) : null}
      </header>
      <ul className="mt-3 space-y-1 text-sm">
        {lines.map((l, i) => (
          <li key={i} className="text-slate/80">
            <span className="text-slate/40">{l.quantity}× </span>
            {l.name}
          </li>
        ))}
      </ul>
    </article>
  );
}
