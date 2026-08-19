"use client";

import { useState } from "react";

/**
 * Sales-tax rate editor.
 *
 * Stored as basis points (825), edited as a percent ("8.25") because
 * that's the number on the venue's own filings. Distinct from
 * EditableField because the value is numeric, needs percent↔bps
 * conversion, and — unlike a cosmetic field — blocks guest payments
 * while unset, so it earns its own explanatory copy.
 */
export function TaxRateField({
  slug,
  initialBps,
  fallbackNote,
}: {
  slug: string;
  initialBps: number | null;
  /** Shown when nothing is stored but the ZIP fallback covers the venue. */
  fallbackNote: string | null;
}) {
  const [bps, setBps] = useState<number | null>(initialBps);
  const [value, setValue] = useState(initialBps === null ? "" : (initialBps / 100).toString());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    const raw = value.trim();

    let next: number | null;
    if (raw === "") {
      next = null;
    } else {
      const percent = Number(raw.replace(/%$/, "").trim());
      if (!Number.isFinite(percent) || percent < 0 || percent > 20) {
        setError("Enter a percent between 0 and 20 — for example 8.25.");
        return;
      }
      // Round to the nearest basis point; 8.25% → 825.
      next = Math.round(percent * 100);
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxRateBps: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setBps(next);
      setValue(next === null ? "" : (next / 100).toString());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setValue(bps === null ? "" : (bps / 100).toString());
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-slate/5 py-2 last:border-0">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Sales tax</p>
          <p className="truncate text-sm text-slate">
            {bps !== null ? (
              `${(bps / 100).toFixed(2)}%`
            ) : fallbackNote ? (
              <span className="text-slate/60">{fallbackNote}</span>
            ) : (
              <span className="text-coral">Not set — guests can&rsquo;t pay yet</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
        >
          {bps !== null ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate/5 py-3 last:border-0">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Sales tax</p>
      <p className="mt-1 text-[11px] text-slate/55">
        The combined state and local rate you charge, as a percent. We add it to
        every bill and pre-order. Leave blank to fall back to your ZIP code.
      </p>
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="8.25"
        className="mt-2 block w-full rounded-xl border border-slate/15 bg-white px-4 py-2.5 font-mono text-sm text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      />
      {error ? <p className="mt-2 text-sm text-coral">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-chartreuse px-4 py-1.5 text-sm font-medium text-slate disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="text-sm text-slate/55 underline-offset-4 hover:text-slate hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
