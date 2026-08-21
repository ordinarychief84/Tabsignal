"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket, joinRoom } from "@/lib/socket";

/**
 * Guests who asked to speak to a manager, and are still waiting.
 *
 * This is the only thing on the dashboard that outranks the live queue.
 * A guest raised their hand for service; this guest has already had a bad
 * night, said so, and asked for someone senior — and they're still in the
 * building. The window closes when they walk out, which is why the card
 * leads with how long they've been waiting rather than when they rated.
 *
 * Renders nothing when there's nothing to do. A permanent empty panel
 * teaches people to stop looking at the place the urgent thing appears.
 *
 * Socket first for immediacy, with a slow poll behind it so a dropped
 * connection can't silently swallow the one alert that matters.
 */

type Recovery = {
  id: string;
  tableLabel: string;
  rating: number;
  note: string | null;
  tags: string[];
  category: string | null;
  serverName: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;

export function RecoveryQueue({ venueId, canResolve }: { venueId: string; canResolve: boolean }) {
  const [items, setItems] = useState<Recovery[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/venue/${venueId}/recovery`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setItems(body.items ?? []);
    } catch {
      /* keep the last good list — losing it would hide the alert */
    }
  }, [venueId]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [load]);

  useEffect(() => {
    const leave = joinRoom({ venueId });
    const socket = getSocket();
    // Refetch rather than trusting the payload: the list is short, and a
    // re-read also picks up anything a colleague resolved meanwhile.
    const onRecovery = () => void load();
    socket.on("service_recovery", onRecovery);
    return () => {
      socket.off("service_recovery", onRecovery);
      leave();
    };
  }, [venueId, load]);

  async function resolve(id: string) {
    if (busy) return;
    setBusy(id);
    // Optimistic: the manager is walking to the table now, and the card
    // lingering makes it look like the tap didn't land.
    setItems(curr => curr.filter(i => i.id !== id));
    try {
      const res = await fetch(`/api/venue/${venueId}/recovery/${id}/resolve`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      void load();
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-live="assertive"
      className="mb-6 overflow-hidden rounded-2xl border-2 border-coral bg-coral/[0.06]"
    >
      <header className="flex items-center justify-between border-b border-coral/25 px-5 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-coral">
            Someone wants a word
          </p>
          <p className="mt-0.5 text-[12px] text-slate/65">
            {items.length === 1
              ? "A guest asked for a manager and is still here."
              : `${items.length} guests asked for a manager and are still here.`}
          </p>
        </div>
      </header>

      <ul className="divide-y divide-coral/15">
        {items.map(item => (
          <li key={item.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-slate">{item.tableLabel}</span>
                <span className="font-mono text-[12px] tabular-nums text-coral">
                  {item.rating}/5
                </span>
                {item.serverName ? (
                  <span className="text-[12px] text-slate/55">served by {item.serverName}</span>
                ) : null}
              </div>

              {item.tags.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.tags.map(t => (
                    <li key={t} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-slate/70">
                      {t}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Their own words. "The wait" and "the steak was cold" need
                  completely different responses. */}
              {item.note ? (
                <p className="mt-2 text-[13px] leading-relaxed text-slate/75">
                  &ldquo;{item.note}&rdquo;
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span
                className="font-mono text-[13px] tabular-nums text-coral"
                title="How long they've been waiting"
              >
                {waitingFor(now, item.createdAt)}
              </span>
              {canResolve ? (
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => void resolve(item.id)}
                  className="min-h-[40px] rounded-xl bg-slate px-4 text-[13px] font-medium text-oat disabled:opacity-60"
                >
                  {busy === item.id ? "…" : "I've spoken to them"}
                </button>
              ) : (
                <span className="text-[12px] text-slate/50">Needs a manager</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Elapsed, not a clock time — the number that matters is the wait. */
function waitingFor(now: number, iso: string): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
