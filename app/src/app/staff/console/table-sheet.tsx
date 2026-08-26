"use client";

import { useEffect, useRef, useState } from "react";
import type { WaiterTable } from "@/lib/waiter-console";

/**
 * One table, opened from the map.
 *
 * A bottom sheet rather than a page, because a waiter tapping a tile
 * wants a look, not a destination — they need to get back to the queue
 * in one gesture, and a route change on bad wifi is a spinner between
 * them and the floor.
 *
 * The contents are the answer to "what's going on at 12": who is
 * waiting, for what, for how long, and what they've been eyeing. Nothing
 * about the guest as a person, because that is not needed to bring them
 * a drink. See the route for the full list of what is withheld and why.
 */

const TYPE_LABEL: Record<string, string> = {
  HELP: "Come by when you can",
  REFILL: "Water / refill",
  ORDER: "Ready to order",
  BILL: "Ready for the check",
  CELEBRATION: "Celebrating something",
  DRINK: "A drink",
  CLEAN: "Clear the table",
  SUPPLIES: "Napkins / cutlery",
};

type Context = {
  table: { label: string; zone: string | null; assignedTo: string[]; assignedToMe: boolean };
  seatedSince: string | null;
  requests: {
    id: string;
    type: string;
    status: string;
    note: string | null;
    waitedFor: string;
    claimedByMe: boolean;
    claimedBy: string | null;
  }[];
  picks: { name: string; quantity: number }[];
};

export function TableSheet({
  table,
  venueId,
  onClose,
  onAcknowledge,
  onOnMyWay,
}: {
  table: WaiterTable;
  venueId: string;
  onClose: () => void;
  onAcknowledge: (requestId: string) => void;
  onOnMyWay: (requestId: string) => void;
}) {
  const [ctx, setCtx] = useState<Context | null>(null);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/venue/${venueId}/tables/${table.id}/context`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (alive) setCtx(body);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [venueId, table.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-plum/40 backdrop-blur-sm sm:items-center"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Table ${table.label}`}
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card outline-none sm:rounded-3xl motion-safe:animate-[slideUp_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <header className="sticky top-0 bg-plum px-5 pb-4 pt-3">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-ivory/25" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-ivory">
                Table {table.label}
              </h2>
              <p className="mt-0.5 text-[12px] text-ivory/70">
                {ctx?.table.assignedToMe
                  ? "Assigned to you"
                  : ctx && ctx.table.assignedTo.length > 0
                    ? `Assigned to ${ctx.table.assignedTo.join(", ")}`
                    : "Nobody assigned"}
                {table.zone ? ` · ${table.zone}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 shrink-0 rounded-lg px-3 py-2 text-[13px] text-ivory/80 hover:bg-white/10 hover:text-ivory"
            >
              Close
            </button>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5">
          {failed ? (
            <p role="alert" className="rounded-xl border border-clay/40 bg-clay-soft px-3.5 py-3 text-[13px] text-clay-deep">
              Couldn&rsquo;t load this table. Close and try again.
            </p>
          ) : !ctx ? (
            <p className="text-[13px] text-graphite">Loading…</p>
          ) : (
            <>
              {ctx.requests.length > 0 ? (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
                    Waiting on you
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {ctx.requests.map(r => (
                      <li
                        key={r.id}
                        className="rounded-xl border border-sandstone bg-surface-muted p-3.5"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[15px] font-medium text-plum">
                            {TYPE_LABEL[r.type] ?? "A request"}
                          </p>
                          <span className="shrink-0 font-mono text-[13px] tabular-nums text-graphite">
                            {r.waitedFor}
                          </span>
                        </div>
                        {r.note ? (
                          <p className="mt-1 text-[13px] italic text-graphite">
                            &ldquo;{r.note}&rdquo;
                          </p>
                        ) : null}

                        {/* One control, matching the request's actual state.
                            Someone else's claimed request is a status here,
                            not a button — two servers walking to one table
                            is the failure this prevents. */}
                        <div className="mt-2.5">
                          {r.status === "ON_MY_WAY" ? (
                            <p className="text-[13px] font-medium text-mint-deep">
                              {r.claimedByMe ? "You're on the way" : `${r.claimedBy} is on the way`}
                            </p>
                          ) : r.status === "ACKNOWLEDGED" && r.claimedByMe ? (
                            <button
                              type="button"
                              onClick={() => onOnMyWay(r.id)}
                              className="min-h-[44px] w-full rounded-xl bg-saffron text-[14px] font-semibold text-plum"
                            >
                              On my way
                            </button>
                          ) : r.status === "ACKNOWLEDGED" ? (
                            <p className="text-[13px] text-graphite">{r.claimedBy} has this</p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onAcknowledge(r.id)}
                              className="min-h-[44px] w-full rounded-xl bg-plum text-[14px] font-semibold text-ivory"
                            >
                              Got it
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="text-[14px] text-graphite">
                  Nothing waiting at this table.
                </p>
              )}

              {ctx.picks.length > 0 ? (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
                    What they&rsquo;ve been eyeing
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {ctx.picks.map(p => (
                      <li
                        key={p.name}
                        className="flex items-baseline justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-[14px] text-plum"
                      >
                        <span>{p.name}</span>
                        <span className="shrink-0 font-mono tabular-nums text-graphite">
                          ×{p.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* Said plainly, because a list of dishes on a service
                      screen looks like a ticket and is not one. */}
                  <p className="mt-2 text-[12px] leading-relaxed text-graphite">
                    A shortlist to talk through, not an order. Take it on the till
                    as usual.
                  </p>
                </section>
              ) : null}

              {ctx.seatedSince ? (
                <p className="text-[12px] text-graphite">
                  Seated {sinceLabel(ctx.seatedSince)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h === 1 ? "about an hour ago" : `about ${h} hours ago`;
}
