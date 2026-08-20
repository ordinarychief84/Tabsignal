"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Open tabs on the floor, and the button that closes one out.
 *
 * Deliberately a separate block below the request queue rather than a
 * fifth tab inside it. The queue's tabs are request buckets and its
 * counts mean "things waiting on you"; folding tables-with-a-tab into
 * that would make those numbers describe two different jobs at once.
 *
 * Closing out is the moment a server takes payment on the venue's own
 * terminal. It stamps GuestSession.paidAt, which is what Regulars, tip
 * pools and the session export all count from — none of which had moved
 * since guest payments were removed, because nothing set it.
 *
 * Polls rather than listening on a socket: a tab changes when someone
 * orders or settles, which is minutes apart, and the staff app already
 * holds one socket for the thing that IS second-by-second (requests).
 */

type Tab = {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  itemCount: number;
  totalCents: number;
  items: { name: string; quantity: number }[];
  openedAt: string;
};

const POLL_MS = 20_000;

export function OpenTabs({
  venueId,
  assignedTableIds,
}: {
  venueId: string;
  /** Tables this server covers. Theirs sort first. */
  assignedTableIds: string[];
}) {
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/venue/${venueId}/tabs`, { cache: "no-store" });
      if (!res.ok) return; // Keep the last good list; the next tick retries.
      const body = await res.json();
      setTabs(body.tabs ?? []);
    } catch { /* offline — keep showing what we have */ }
  }, [venueId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function settle(sessionId: string) {
    if (busy) return;
    setBusy(sessionId);
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/settle`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setTabs(curr => curr?.filter(t => t.sessionId !== sessionId) ?? curr);
      setConfirming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't close that tab");
    } finally {
      setBusy(null);
    }
  }

  // Nothing to settle is the normal state on a quiet floor — say nothing
  // rather than occupy a third of the screen with an empty card.
  if (!tabs || tabs.length === 0) return null;

  const assigned = new Set(assignedTableIds);
  const sorted = [...tabs].sort((a, b) => {
    const mine = Number(assigned.has(b.tableId)) - Number(assigned.has(a.tableId));
    return mine !== 0 ? mine : a.openedAt.localeCompare(b.openedAt);
  });

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-umber">
        Open tabs · {sorted.length}
      </h2>

      {error ? (
        <p role="alert" className="mb-2 rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-[12px] text-coral">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {sorted.map(t => (
          <li
            key={t.sessionId}
            className={[
              "rounded-2xl border bg-white px-4 py-3",
              assigned.has(t.tableId) ? "border-chartreuse" : "border-umber-soft/30",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate">
                  {t.tableLabel}
                  {assigned.has(t.tableId) ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate/45">yours</span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-slate/60">
                  {t.items.map(i => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.name}`).join(", ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-mono text-sm tabular-nums text-slate">
                  ${(t.totalCents / 100).toFixed(2)}
                </span>
                {confirming === t.sessionId ? (
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="rounded-lg px-2 py-1 text-[11px] text-slate/55 hover:text-slate"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy === t.sessionId}
                      onClick={() => settle(t.sessionId)}
                      className="rounded-lg bg-slate px-3 py-1.5 text-[11px] font-medium text-oat disabled:opacity-60"
                    >
                      {busy === t.sessionId ? "Closing…" : "Confirm"}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(t.sessionId)}
                    className="rounded-lg border border-slate/20 px-3 py-1.5 text-[11px] font-medium text-slate hover:bg-slate/5"
                  >
                    Close out
                  </button>
                )}
              </div>
            </div>
            {confirming === t.sessionId ? (
              // Two-step rather than a dialog: this is a phone in a busy
              // room, and closing the wrong table ends that guest's
              // ability to order.
              <p className="mt-2 text-[11px] leading-relaxed text-slate/55">
                Take payment on your card machine first — this only marks the
                tab closed and stops {t.tableLabel} ordering more.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
