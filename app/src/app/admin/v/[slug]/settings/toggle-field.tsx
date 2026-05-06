"use client";

import { useState } from "react";

export function ToggleField({
  slug,
  field,
  label,
  help,
  initial,
}: {
  slug: string;
  field: string;
  label: string;
  help?: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-slate/5 py-3 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
          {help ? <p className="mt-1 text-[11px] leading-relaxed text-slate/55">{help}</p> : null}
        </div>
        <button
          type="button"
          onClick={flip}
          disabled={busy}
          aria-pressed={on}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
            on ? "bg-chartreuse" : "bg-slate/15",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-5" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-coral">{error}</p> : null}
    </div>
  );
}
