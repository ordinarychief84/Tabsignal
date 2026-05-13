"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Read-only Bills panel: tabular list, click a row to expand into split
// detail. Polls every 10s so a freshly-paid split flips status without a
// hard refresh. No mutation actions yet — the spec calls for visibility
// first; refund/comp UI is a separate concern.

export type AdminBillItem = {
  id: string;
  nameSnapshot: string;
  priceCents: number;
  quantity: number;
  status: "UNPAID" | "PAID";
  paidBySplitId: string | null;
};

export type AdminBillSplit = {
  id: string;
  status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED";
  totalCents: number;
  tipCents: number;
  paidAt: string | null;
  billItemIds: string[];
};

export type AdminBill = {
  id: string;
  status: "OPEN" | "PARTIAL" | "PAID" | "REFUNDED" | "CANCELLED";
  tableLabel: string | null;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  splitCount: number;
  itemCount: number;
  createdAt: string;
  items: AdminBillItem[];
  splits: AdminBillSplit[];
};

type Tab = "all" | "OPEN" | "PARTIAL" | "PAID";

const TAB_ORDER: { id: Tab; label: string }[] = [
  { id: "all",     label: "All"     },
  { id: "OPEN",    label: "Open"    },
  { id: "PARTIAL", label: "Partial" },
  { id: "PAID",    label: "Paid"    },
];

const POLL_INTERVAL_MS = 10_000;

function dollars(cents: number): string {
  if (cents < 0) return `−$${(Math.abs(cents) / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BillsPanel({
  slug,
  initial,
}: {
  slug: string;
  initial: AdminBill[];
}) {
  const [bills, setBills] = useState<AdminBill[]>(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/v/${slug}/bills`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setBills(body.bills as AdminBill[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [slug]);

  useEffect(() => {
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "all") return bills;
    return bills.filter(b => b.status === tab);
  }, [bills, tab]);

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
          No bills in this bucket.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate/10 bg-slate/5 text-left text-[11px] uppercase tracking-wider text-umber">
              <tr>
                <th className="px-4 py-2 font-medium">Bill</th>
                <th className="px-4 py-2 font-medium">Table</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Paid</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Splits</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const isOpen = expanded === b.id;
                return (
                  <BillRows
                    key={b.id}
                    bill={b}
                    expanded={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : b.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusBadge(status: AdminBill["status"]) {
  switch (status) {
    case "OPEN":      return { label: "Open",      cls: "bg-chartreuse/30 text-slate" };
    case "PARTIAL":   return { label: "Partial",   cls: "bg-coral/20 text-coral" };
    case "PAID":      return { label: "Paid",      cls: "bg-sea/20 text-slate" };
    case "REFUNDED":  return { label: "Refunded",  cls: "bg-umber/20 text-umber" };
    case "CANCELLED": return { label: "Cancelled", cls: "bg-slate/10 text-slate/40 line-through" };
  }
}

function splitBadge(status: AdminBillSplit["status"]) {
  switch (status) {
    case "PENDING":   return { label: "Pending",   cls: "bg-chartreuse/30 text-slate" };
    case "PAID":      return { label: "Paid",      cls: "bg-sea/20 text-slate" };
    case "REFUNDED":  return { label: "Refunded",  cls: "bg-umber/20 text-umber" };
    case "CANCELLED": return { label: "Cancelled", cls: "bg-slate/10 text-slate/40" };
  }
}

function BillRows({
  bill,
  expanded,
  onToggle,
}: {
  bill: AdminBill;
  expanded: boolean;
  onToggle: () => void;
}) {
  const badge = statusBadge(bill.status);
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-slate/5 hover:bg-slate/5"
      >
        <td className="px-4 py-3 font-mono text-xs text-slate/60">…{bill.id.slice(-6)}</td>
        <td className="px-4 py-3 text-slate">{bill.tableLabel ?? "—"}</td>
        <td className="px-4 py-3 font-mono tabular-nums text-slate">{dollars(bill.totalCents)}</td>
        <td className="px-4 py-3 font-mono tabular-nums text-slate/70">{dollars(bill.amountPaidCents)}</td>
        <td className={[
          "px-4 py-3 font-mono tabular-nums",
          bill.amountDueCents > 0 ? "text-coral" : "text-slate/40",
        ].join(" ")}>
          {dollars(bill.amountDueCents)}
        </td>
        <td className="px-4 py-3 text-slate/70">{bill.splitCount}</td>
        <td className="px-4 py-3">
          <span className={["rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider", badge.cls].join(" ")}>
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-slate/50">{fmtTime(bill.createdAt)}</td>
      </tr>
      {expanded ? (
        <tr className="bg-slate/[0.02]">
          <td colSpan={8} className="px-6 py-4">
            <BillDetail bill={bill} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function BillDetail({ bill }: { bill: AdminBill }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-umber">Items</h3>
        <ul className="space-y-1 text-sm">
          {bill.items.map(i => (
            <li key={i.id} className="flex items-baseline justify-between gap-3">
              <span className="text-slate">
                <span className="text-slate/40">{i.quantity}× </span>
                {i.nameSnapshot}
                {i.status === "PAID" ? (
                  <span className="ml-2 rounded-full bg-sea/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate">
                    paid
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-xs tabular-nums text-slate/60">
                {dollars(i.priceCents * i.quantity)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-umber">Splits</h3>
        {bill.splits.length === 0 ? (
          <p className="text-sm text-slate/50">No splits yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {bill.splits.map(s => {
              const sb = splitBadge(s.status);
              return (
                <li key={s.id} className="rounded-lg border border-slate/10 bg-white px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-slate/40">…{s.id.slice(-6)}</span>
                    <span className={["rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider", sb.cls].join(" ")}>
                      {sb.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-slate/60">
                      {s.billItemIds.length} {s.billItemIds.length === 1 ? "item" : "items"}
                      {s.tipCents > 0 ? <> · tip {dollars(s.tipCents)}</> : null}
                    </span>
                    <span className="font-mono tabular-nums text-slate">{dollars(s.totalCents)}</span>
                  </div>
                  {s.paidAt ? (
                    <p className="mt-1 text-[11px] text-slate/40">Paid {fmtTime(s.paidAt)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
