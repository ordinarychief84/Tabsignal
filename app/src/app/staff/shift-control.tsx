"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SHIFT_HINTS,
  SHIFT_LABELS,
  SHIFT_SHORT,
  SHIFT_STATUSES,
  offShiftWarning,
  type ShiftStatus,
} from "@/lib/shift";

/**
 * "On shift" — the chip in the header, and the menu behind it.
 *
 * Small on purpose. A server changes this four times a shift and reads
 * the request queue four hundred times, so it gets a chip rather than a
 * panel.
 *
 * The one place it takes up room is going off shift with work still
 * open. That is a warning, not a block: a server is allowed to leave,
 * and a product that refuses would simply get lied to — they would tap
 * Off and walk out anyway, or worse, not tap anything and leave the
 * floor plan wrong. So it names what is still open and lets them decide.
 */

const TONE: Record<ShiftStatus, string> = {
  ON_SHIFT: "border-mint-deep/30 bg-mint text-mint-deep",
  BREAK: "border-saffron-deep/30 bg-saffron-soft text-saffron-deep",
  MEAL_BREAK: "border-saffron-deep/30 bg-saffron-soft text-saffron-deep",
  OFF_SHIFT: "border-sandstone bg-surface-muted text-graphite",
};

export function ShiftControl({
  initial,
  initialStartedAt,
}: {
  initial: ShiftStatus;
  initialStartedAt: string | null;
}) {
  const [status, setStatus] = useState<ShiftStatus>(initial);
  const [startedAt, setStartedAt] = useState<string | null>(initialStartedAt);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const commit = useCallback(async (next: ShiftStatus) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/shift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setStatus(body.shiftStatus as ShiftStatus);
      setStartedAt(body.shiftStartedAt ?? null);
      setOpen(false);
      setWarning(null);
    } catch {
      // Never leave the chip showing a state the server doesn't hold.
      // A server who thinks they're off shift while requests still route
      // to them is worse off than one who saw the change fail.
      setError("Couldn't change that. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function choose(next: ShiftStatus) {
    if (next === status) {
      setOpen(false);
      return;
    }
    if (next === "OFF_SHIFT") {
      // Ask the server what is still open before letting them go.
      try {
        const res = await fetch("/api/staff/shift", { cache: "no-store" });
        if (res.ok) {
          const counts = await res.json();
          const w = offShiftWarning(counts);
          if (w) {
            setWarning(w);
            return;
          }
        }
      } catch {
        /* offline — don't block leaving over a failed advisory check */
      }
    }
    await commit(next);
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          "flex min-h-[36px] items-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition-colors",
          TONE[status],
        ].join(" ")}
      >
        {/* Shape as well as colour: filled when working, hollow when not,
            so the state survives a colour-blind reading and a dim room. */}
        <span
          aria-hidden
          className={[
            "h-2 w-2 rounded-full",
            status === "ON_SHIFT" ? "bg-current" : "ring-1 ring-current",
          ].join(" ")}
        />
        {SHIFT_SHORT[status]}
        {startedAt ? <ShiftClock since={startedAt} /> : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Shift status"
          className="absolute right-0 z-50 mt-2 w-[16rem] overflow-hidden rounded-2xl border border-sandstone bg-surface shadow-card"
        >
          <ul>
            {SHIFT_STATUSES.map(s => (
              <li key={s}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={s === status}
                  disabled={busy}
                  onClick={() => void choose(s)}
                  className={[
                    "flex w-full flex-col items-start gap-0.5 border-b border-sandstone px-4 py-3 text-left transition-colors last:border-b-0 disabled:opacity-60",
                    s === status ? "bg-surface-muted" : "hover:bg-surface-hover",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2 text-[14px] font-medium text-plum">
                    {s === status ? <span aria-hidden>✓</span> : null}
                    {SHIFT_LABELS[s]}
                  </span>
                  <span className="text-[12px] leading-snug text-graphite">
                    {SHIFT_HINTS[s]}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {warning ? (
            <div className="border-t border-clay/30 bg-clay-soft p-3">
              <p role="alert" className="text-[13px] leading-relaxed text-clay-deep">
                {warning}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWarning(null)}
                  className="min-h-[40px] flex-1 rounded-lg border border-clay/40 text-[13px] font-medium text-clay-deep"
                >
                  Stay on
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void commit("OFF_SHIFT")}
                  className="min-h-[40px] flex-1 rounded-lg bg-plum text-[13px] font-medium text-ivory disabled:opacity-60"
                >
                  Go off anyway
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="border-t border-clay/30 bg-clay-soft px-4 py-2.5 text-[12px] text-clay-deep">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * How long they've been on. Minutes only — a seconds-accurate shift
 * clock is a distraction, and re-rendering the header every second on a
 * phone that's already holding a socket is a waste of battery.
 */
function ShiftClock({ since }: { since: string }) {
  const [label, setLabel] = useState(() => elapsed(since));
  useEffect(() => {
    const t = setInterval(() => setLabel(elapsed(since)), 30_000);
    return () => clearInterval(t);
  }, [since]);
  return <span className="font-mono tabular-nums opacity-70">{label}</span>;
}

function elapsed(since: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}
