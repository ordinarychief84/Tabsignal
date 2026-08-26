"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StaffQueue } from "../queue";
import { OpenTabs } from "../open-tabs";
import { ShiftControl } from "../shift-control";
import { OperationalSummary } from "./summary";
import { TableMap } from "./table-map";
import { TableSheet } from "./table-sheet";
import type { ShiftSummary, WaiterTable, WaiterFeedback } from "@/lib/waiter-console";
import type { ShiftStatus } from "@/lib/shift";
import { getSocket, joinRoom } from "@/lib/socket";

/**
 * The waiter console.
 *
 * Three regions on a wide screen — navigation, the queue, and the floor
 * — collapsing to a single column with the queue on top. That order is
 * the point: a server opening this on a phone must see who is waiting
 * before anything else, so metrics, the table map and the tabs sit
 * BELOW the queue on mobile even though they sit beside it on a tablet.
 *
 * The queue itself is the existing StaffQueue, unchanged in substance.
 * It already handles realtime, escalation shading, multi-call detection,
 * handoff and the resolution picker; rebuilding it to match a mockup
 * would have thrown away working behaviour for a new coat of paint.
 * What is new is everything AROUND it.
 *
 * The floor refreshes on a slow interval rather than a second socket:
 * table state is derived from requests the queue is already receiving,
 * so it can lag a few seconds without anyone noticing, and a server on
 * venue wifi does not need another persistent connection.
 */

const FLOOR_REFRESH_MS = 20_000;

export function WaiterConsole({
  venueId,
  venueSlug,
  venueName,
  staffId,
  staffName,
  section,
  greeting,
  shiftStatus,
  shiftStartedAt,
  assignedTableIds,
  initialTables,
  initialSummary,
  feedback,
  canManage,
  adminHref,
}: {
  venueId: string;
  venueSlug: string;
  venueName: string;
  staffId: string;
  /** First name — the one they go by on the floor. */
  staffName: string;
  section: string | null;
  greeting: string;
  shiftStatus: ShiftStatus;
  shiftStartedAt: string | null;
  assignedTableIds: string[];
  initialTables: WaiterTable[];
  initialSummary: ShiftSummary;
  feedback: WaiterFeedback[];
  canManage: boolean;
  adminHref: string;
}) {
  const [tables, setTables] = useState(initialTables);
  const [summary, setSummary] = useState(initialSummary);
  const [openTable, setOpenTable] = useState<WaiterTable | null>(null);

  const refreshFloor = useCallback(async () => {
    try {
      const res = await fetch(`/api/venue/${venueId}/floor`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setTables(body.tables ?? []);
      setSummary(body.summary ?? initialSummary);
    } catch {
      /* offline — the last good floor is better than an empty one */
    }
  }, [venueId, initialSummary]);

  useEffect(() => {
    const t = setInterval(() => void refreshFloor(), FLOOR_REFRESH_MS);
    return () => clearInterval(t);
  }, [refreshFloor]);

  // A request landing anywhere changes the floor, so piggyback on the
  // socket the queue already holds rather than opening a second one.
  useEffect(() => {
    const socket = getSocket();
    const leave = joinRoom({ venueId });
    const bump = () => void refreshFloor();
    for (const e of ["new_request", "request_acknowledged", "request_on_my_way", "request_resolved"]) {
      socket.on(e, bump);
    }
    return () => {
      for (const e of ["new_request", "request_acknowledged", "request_on_my_way", "request_resolved"]) {
        socket.off(e, bump);
      }
      leave();
    };
  }, [venueId, refreshFloor]);

  async function act(requestId: string, path: "acknowledge" | "on-my-way") {
    try {
      await fetch(`/api/requests/${requestId}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      // Whatever happened, re-read rather than guess. The sheet is a
      // secondary surface and correctness beats snappiness here.
      void refreshFloor();
      setOpenTable(null);
    }
  }

  const needsAttention = tables.filter(t => t.mine && t.state === "needs_attention");
  const longestWait = Math.max(0, ...tables.filter(t => t.mine).map(t => t.oldestWaitSeconds ?? 0));

  return (
    <div className="min-h-[100dvh] bg-ivory text-plum">
      <header className="sticky top-0 z-30 border-b border-sandstone bg-ivory/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite">
              {venueName}
              {section ? ` · ${section}` : ""}
            </p>
            <h1 className="mt-0.5 truncate text-[20px] font-semibold leading-tight tracking-tight text-plum lg:text-[24px]">
              {greeting}, {staffName}
            </h1>
            <p className="mt-0.5 hidden text-[13px] text-graphite sm:block">
              Here&rsquo;s what&rsquo;s happening
              {section ? ` in ${section}` : " at your tables"}.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ShiftControl initial={shiftStatus} initialStartedAt={shiftStartedAt} />
          </div>
        </div>
      </header>

      {/* §44: when the floor gets busy, one line at the top — not a wall
          of warnings competing with the queue that would resolve them. */}
      {needsAttention.length > 0 ? (
        <div
          role="status"
          className="border-b border-clay/30 bg-clay-soft px-4 py-2 text-[13px] text-clay-deep lg:px-6"
        >
          <span className="mx-auto flex max-w-6xl items-center gap-2">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-clay-deep" />
            <span>
              <strong className="font-semibold">
                {needsAttention.length}{" "}
                {needsAttention.length === 1 ? "table needs" : "tables need"} attention
              </strong>
              {longestWait > 0 ? ` · longest wait ${Math.floor(longestWait / 60)}m` : ""}
            </span>
          </span>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:px-6 lg:py-6">
        {/* Queue first in the DOM as well as on screen: it is what a
            screen reader should reach first, and what a phone shows
            without scrolling. */}
        <main className="min-w-0 space-y-5">
          <OperationalSummary summary={summary} />
          <StaffQueue
            venueId={venueId}
            venueSlug={venueSlug}
            staffId={staffId}
            assignedTableIds={assignedTableIds}
          />
          <OpenTabs venueId={venueId} assignedTableIds={assignedTableIds} />
        </main>

        <aside className="min-w-0 space-y-5">
          <TableMap tables={tables} section={section} onOpen={setOpenTable} />

          {feedback.length > 0 ? (
            <section className="rounded-2xl border border-sandstone bg-surface p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
                What guests said
              </h2>
              <ul className="mt-3 space-y-2.5">
                {feedback.map(f => (
                  <li key={f.id} className="flex gap-2.5">
                    <span aria-hidden className="shrink-0 text-[16px] leading-tight">
                      {faceFor(f.rating)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] text-graphite">
                        {/* Rating in words as well as a face — an emoji
                            alone is not a score a screen reader can read. */}
                        {ratingWord(f.rating)}
                        {f.tableLabel ? ` · Table ${f.tableLabel}` : ""}
                      </span>
                      {f.comment ? (
                        <span className="mt-0.5 block text-[13px] leading-snug text-plum">
                          {f.comment}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* §31: only actions that actually do something. No dead
              buttons — a control that does nothing on a service screen
              costs more trust than the feature was worth. */}
          <section className="rounded-2xl border border-sandstone bg-surface p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
              Quick actions
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <QuickAction href={`/v/${venueSlug}/menu`} label="View menu" />
              {canManage ? <QuickAction href={adminHref} label="Dashboard" /> : null}
              <QuickAction href="/staff/watch" label="Pair a watch" />
              <QuickAction href="/staff/account/password" label="Password" />
            </div>
          </section>
        </aside>
      </div>

      {openTable ? (
        <TableSheet
          table={openTable}
          venueId={venueId}
          onClose={() => setOpenTable(null)}
          onAcknowledge={id => void act(id, "acknowledge")}
          onOnMyWay={id => void act(id, "on-my-way")}
        />
      ) : null}
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center justify-center rounded-xl border border-sandstone bg-surface-muted px-3 text-center text-[13px] font-medium text-plum transition-colors hover:bg-surface-hover"
    >
      {label}
    </Link>
  );
}

/** Decoration. The word beside it carries the meaning. */
function faceFor(rating: number | null): string {
  if (rating === null) return "•";
  if (rating >= 5) return "😍";
  if (rating >= 4) return "🙂";
  if (rating >= 2) return "😐";
  return "😞";
}

function ratingWord(rating: number | null): string {
  if (rating === null) return "No rating";
  if (rating >= 5) return "Amazing";
  if (rating >= 4) return "Good";
  if (rating >= 2) return "Okay";
  return "Not great";
}
