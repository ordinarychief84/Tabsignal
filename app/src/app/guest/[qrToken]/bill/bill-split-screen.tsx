"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { dollars } from "@/lib/bill";

export type BillItemRow = {
  id: string;
  nameSnapshot: string;
  priceCents: number;
  quantity: number;
  status: "UNPAID" | "PAID";
};

type Props = {
  qrToken: string;
  slug: string;
  billId: string;
  sessionId: string;
  sessionToken: string;
  items: BillItemRow[];
  amountDueCents: number;
};

export function BillSplitScreen({
  qrToken,
  slug,
  billId,
  sessionId,
  sessionToken,
  items,
  amountDueCents,
}: Props) {
  const unpaidItems = useMemo(
    () => items.filter(i => i.status === "UNPAID"),
    [items],
  );
  const paidItems = useMemo(
    () => items.filter(i => i.status === "PAID"),
    [items],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnpaid() {
    setSelected(new Set(unpaidItems.map(i => i.id)));
  }

  const selectedTotalCents = useMemo(
    () =>
      unpaidItems
        .filter(i => selected.has(i.id))
        .reduce((s, i) => s + i.priceCents * i.quantity, 0),
    [unpaidItems, selected],
  );

  async function payCurrent(mode: "selected" | "rest") {
    const ids =
      mode === "rest"
        ? unpaidItems.map(i => i.id)
        : Array.from(selected);
    if (ids.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v/${slug}/bills/${billId}/splits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          billItemIds: ids,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? body?.detail ?? `HTTP ${res.status}`);
      }
      const splitId: string | undefined = body?.splitId ?? body?.id;
      const clientSecret: string | undefined =
        body?.clientSecret ?? body?.client_secret;
      if (!splitId || !clientSecret) {
        throw new Error("Split created but Stripe client secret missing");
      }
      const qs = new URLSearchParams({ split: splitId, secret: clientSecret });
      window.location.href = `/guest/${encodeURIComponent(qrToken)}/pay?${qs.toString()}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {paidItems.length > 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white">
          <div className="border-b border-slate/10 px-5 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-umber">
              Paid · {paidItems.length}
            </p>
          </div>
          <ul className="divide-y divide-slate/5">
            {paidItems.map(it => (
              <li
                key={it.id}
                className="flex items-center justify-between px-5 py-3 text-sm text-slate/55"
              >
                <span>
                  {it.quantity > 1 ? (
                    <span className="text-slate/40">{it.quantity}× </span>
                  ) : null}
                  <span className="line-through">{it.nameSnapshot}</span>
                </span>
                <span className="font-mono tabular-nums">
                  {dollars(it.priceCents * it.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate/10 bg-white">
        <div className="flex items-center justify-between border-b border-slate/10 px-5 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">
            Unpaid · {unpaidItems.length}
          </p>
          {unpaidItems.length > 0 ? (
            <button
              type="button"
              onClick={selectAllUnpaid}
              className="text-[11px] uppercase tracking-wider text-umber hover:underline"
            >
              Select all
            </button>
          ) : null}
        </div>
        <ul className="divide-y divide-slate/5">
          {unpaidItems.length === 0 ? (
            <li className="px-5 py-5 text-sm text-slate/50">
              All items on this bill are paid.
            </li>
          ) : (
            unpaidItems.map(it => {
              const isChecked = selected.has(it.id);
              return (
                <li
                  key={it.id}
                  className="flex items-center gap-3 px-5 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(it.id)}
                    className="h-4 w-4 accent-slate"
                    aria-label={`Pay ${it.nameSnapshot}`}
                  />
                  <span className="flex-1">
                    {it.quantity > 1 ? (
                      <span className="text-slate/50">{it.quantity}× </span>
                    ) : null}
                    {it.nameSnapshot}
                  </span>
                  <span className="font-mono tabular-nums">
                    {dollars(it.priceCents * it.quantity)}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white px-5 py-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate/65">Selected</span>
          <span className="font-mono tabular-nums">
            {dollars(selectedTotalCents)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-slate/55">
          <span>Remaining on bill</span>
          <span className="font-mono tabular-nums">
            {dollars(amountDueCents)}
          </span>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => payCurrent("selected")}
        disabled={submitting || selected.size === 0}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting
          ? "Preparing payment…"
          : `Pay selected · ${dollars(selectedTotalCents)}`}
      </button>

      <button
        type="button"
        onClick={() => payCurrent("rest")}
        disabled={submitting || unpaidItems.length === 0}
        className="w-full rounded-xl border border-slate/15 bg-white py-3 text-sm font-medium text-slate/75 hover:border-slate/30 disabled:opacity-60"
      >
        Pay the rest · {dollars(amountDueCents)}
      </button>

      <Link
        href={`/guest/${encodeURIComponent(qrToken)}`}
        className="block text-center text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
      >
        ← back to table
      </Link>
    </div>
  );
}
