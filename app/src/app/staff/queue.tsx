"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, joinRoom } from "@/lib/socket";

type Item = {
  id: string;
  tableId?: string;
  tableLabel: string;
  type: "DRINK" | "BILL" | "HELP" | "REFILL";
  note: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
  idCheckRequired?: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
};

const REQUEST_LABEL: Record<Item["type"], string> = {
  DRINK: "Drink",
  BILL: "Bill",
  HELP: "Help",
  REFILL: "Refill",
};

// Safety-net poll interval — covers socket reconnect gaps. Real-time pushes
// (new_request / request_acknowledged / request_resolved) carry the load.
const POLL_INTERVAL_MS = 30_000;

type StaffMate = { id: string; name: string };

export function StaffQueue({
  venueId,
  staffId,
  assignedTableIds = [],
}: {
  venueId: string;
  staffId?: string;
  assignedTableIds?: string[];
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [filter, setFilter] = useState<"yours" | "all">(
    assignedTableIds.length > 0 ? "yours" : "all"
  );
  const [staffMates, setStaffMates] = useState<StaffMate[]>([]);
  const [handoffToast, setHandoffToast] = useState<string | null>(null);
  // Tier 3e: regular at one of your tables. Buzzes once, persists for 90s.
  const [regularToast, setRegularToast] = useState<{
    profileId: string;
    name: string;
    visits: number;
    topItem: string | null;
    pinnedNote: string | null;
  } | null>(null);
  const aborter = useRef<AbortController | null>(null);
  const assignedSet = new Set(assignedTableIds);

  const refresh = useCallback(async () => {
    aborter.current?.abort();
    aborter.current = new AbortController();
    try {
      const res = await fetch(`/api/venue/${venueId}/requests/live`, {
        signal: aborter.current.signal,
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // swallow — next event or poll will reconcile
    }
  }, [venueId]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    const leave = joinRoom({ venueId, staffId });
    const socket = getSocket();

    function onNew({ request }: { request: Item }) {
      if (!request) return;
      setItems(prev => {
        if (prev.some(i => i.id === request.id)) return prev;
        return [request, ...prev];
      });
    }

    function onAck({ request }: { request: Partial<Item> & { id: string } }) {
      if (!request) return;
      setItems(prev =>
        prev.map(i =>
          i.id === request.id
            ? {
                ...i,
                status: (request.status as Item["status"]) ?? "ACKNOWLEDGED",
                acknowledgedAt: request.acknowledgedAt ?? new Date().toISOString(),
                acknowledgedBy: i.acknowledgedBy,
              }
            : i
        )
      );
    }

    function onResolved({ request }: { request: { id: string } }) {
      if (!request) return;
      setItems(prev => prev.filter(i => i.id !== request.id));
    }

    function onDisconnect() { setReconnecting(true); }
    function onConnect() { setReconnecting(false); refresh(); }
    function onHandedOffToYou(payload: { request?: { tableLabel: string; type: string; fromStaffId: string | null } } | null) {
      const r = payload?.request;
      if (!r) return;
      setHandoffToast(`${r.tableLabel} · ${r.type.toLowerCase()} — handed off to you`);
      // Auto-clear after 4s.
      setTimeout(() => setHandoffToast(null), 4000);
      refresh();
    }

    function onRegularArrivedForYou(payload: {
      sessionId?: string;
      tableId?: string | null;
      preview?: {
        profileId: string;
        displayName: string | null;
        visits: number;
        topItem: string | null;
        pinnedNote: string | null;
      };
    } | null) {
      const p = payload?.preview;
      if (!p) return;
      setRegularToast({
        profileId: p.profileId,
        name: p.displayName ?? "Returning guest",
        visits: p.visits,
        topItem: p.topItem,
        pinnedNote: p.pinnedNote,
      });
      // Auto-clear after 90s.
      setTimeout(() => setRegularToast(curr => curr?.profileId === p.profileId ? null : curr), 90_000);
    }

    socket.on("new_request", onNew);
    socket.on("request_acknowledged", onAck);
    socket.on("request_resolved", onResolved);
    socket.on("request_handed_off_to_you", onHandedOffToYou);
    socket.on("regular_arrived_for_you", onRegularArrivedForYou);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      clearInterval(poll);
      leave();
      socket.off("new_request", onNew);
      socket.off("request_acknowledged", onAck);
      socket.off("request_resolved", onResolved);
      socket.off("request_handed_off_to_you", onHandedOffToYou);
      socket.off("regular_arrived_for_you", onRegularArrivedForYou);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      aborter.current?.abort();
    };
  }, [venueId, staffId, refresh]);

  // Lazy-load the staff list once for the handoff popover.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/staff")
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => { if (!cancelled) setStaffMates((d.items ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))); })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, []);

  const visibleItems =
    filter === "yours"
      ? items.filter(i => !i.tableId || assignedSet.has(i.tableId))
      : items;
  const yourCount = items.filter(i => i.tableId && assignedSet.has(i.tableId)).length;

  async function ack(id: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/requests/${id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      // Server returns the actual ack state — including `alreadyAcked: true`
      // with `acknowledgedBy.name` if another staff beat us to it. Use
      // server truth instead of optimistic-only so the loser shows the
      // real acker, not a stale-self attribution.
      const body = await res.json().catch(() => ({}));
      setItems(prev =>
        prev.map(it =>
          it.id === id
            ? {
                ...it,
                status: (body.status as Item["status"]) ?? "ACKNOWLEDGED",
                acknowledgedAt: body.acknowledgedAt ?? new Date().toISOString(),
                acknowledgedBy: body.acknowledgedBy
                  ? { id: it.acknowledgedBy?.id ?? "", name: body.acknowledgedBy.name }
                  : it.acknowledgedBy,
              }
            : it
        )
      );
    } finally {
      setPendingId(null);
    }
  }

  // The resolve endpoint now requires an action (SERVED / COMPED / REFUSED
  // / ESCALATED / NOT_ACTIONABLE / OTHER) so we can track what the staff
  // member actually did. The picker is rendered inline on the row.
  async function resolve(id: string, action: string, note?: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/requests/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      setItems(prev => prev.filter(it => it.id !== id));
    } catch (e) {
      console.warn("[queue] resolve failed", e);
    } finally {
      setPendingId(null);
    }
  }

  async function handoff(id: string, toStaffId: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/requests/${id}/handoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStaffId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // The realtime ack event will reconcile the UI; do an optimistic
      // local swap so the local user sees the new owner immediately.
      const dest = staffMates.find(s => s.id === toStaffId);
      if (dest) {
        setItems(prev =>
          prev.map(it =>
            it.id === id
              ? { ...it, acknowledgedBy: { id: dest.id, name: dest.name } }
              : it
          )
        );
      }
    } catch {
      /* refresh will reconcile */
    } finally {
      setPendingId(null);
    }
  }

  const showFilter = assignedTableIds.length > 0;

  return (
    <>
      {reconnecting ? (
        <div className="mb-3 rounded-lg bg-sea/20 px-3 py-2 text-center text-xs text-oat/70">
          Reconnecting…
        </div>
      ) : null}

      {showFilter ? (
        <div className="mb-3 inline-flex rounded-xl border border-white/10 p-1 text-[11px]">
          <button
            type="button"
            onClick={() => setFilter("yours")}
            className={[
              "rounded-lg px-3 py-1.5 font-medium transition-colors",
              filter === "yours" ? "bg-chartreuse text-slate" : "text-oat/60 hover:text-oat",
            ].join(" ")}
          >
            Your tables · {yourCount}
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={[
              "rounded-lg px-3 py-1.5 font-medium transition-colors",
              filter === "all" ? "bg-chartreuse text-slate" : "text-oat/60 hover:text-oat",
            ].join(" ")}
          >
            All · {items.length}
          </button>
        </div>
      ) : null}

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-slate-light/40 px-6 py-10 text-center">
          <p className="text-sm text-oat/60">
            {showFilter && filter === "yours" ? "Nothing on your tables right now." : "Floor is quiet."}
          </p>
          <p className="mt-1 text-[11px] tracking-wide text-oat/30">
            New requests appear here within 1 second.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleItems.map(it => (
            <RequestCard
              key={it.id}
              item={it}
              isYours={!!it.tableId && assignedSet.has(it.tableId)}
              busy={pendingId === it.id}
              currentStaffId={staffId}
              staffMates={staffMates}
              onAck={() => ack(it.id)}
              onResolve={(action, note) => resolve(it.id, action, note)}
              onHandoff={(toStaffId) => handoff(it.id, toStaffId)}
            />
          ))}
        </ul>
      )}

      {handoffToast ? (
        <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-chartreuse px-4 py-2 text-sm font-medium text-slate shadow-lg">
          {handoffToast}
        </div>
      ) : null}

      {regularToast ? (
        <div className="fixed bottom-20 left-1/2 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-chartreuse/40 bg-white px-4 py-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Regular at your table</p>
              <p className="mt-1 text-sm font-medium">
                {regularToast.name}
                <span className="text-slate/60"> · visit #{regularToast.visits + 1}</span>
              </p>
              {regularToast.topItem ? (
                <p className="mt-0.5 text-xs text-slate/70">Usually: {regularToast.topItem}</p>
              ) : null}
              {regularToast.pinnedNote ? (
                <p className="mt-1 rounded bg-chartreuse/10 px-2 py-1 text-xs text-slate/80">
                  {regularToast.pinnedNote}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => setRegularToast(null)}
              className="shrink-0 rounded-full border border-slate/15 px-2 py-0.5 text-[11px] text-slate/60"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RequestCard({
  item,
  isYours,
  busy,
  currentStaffId,
  staffMates,
  onAck,
  onResolve,
  onHandoff,
}: {
  item: Item;
  isYours: boolean;
  busy: boolean;
  currentStaffId?: string;
  staffMates: StaffMate[];
  onAck: () => void;
  onResolve: (action: string, note?: string) => void;
  onHandoff: (toStaffId: string) => void;
}) {
  const acked = item.status === "ACKNOWLEDGED";
  const ackedByMe = acked && !!currentStaffId && item.acknowledgedBy?.id === currentStaffId;
  const seconds = useAge(item.createdAt);
  const delayed = seconds > 180;
  const warning = !delayed && seconds > 60;
  const [showHandoff, setShowHandoff] = useState(false);
  const [showResolveActions, setShowResolveActions] = useState(false);
  const others = staffMates.filter(s => s.id !== currentStaffId);

  return (
    <li
      className={[
        "rounded-2xl border bg-slate-light p-4 transition-colors",
        delayed ? "border-coral ring-1 ring-coral/30" : warning ? "border-sea/40" : isYours ? "border-chartreuse/40" : "border-white/5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-medium text-oat">{item.tableLabel}</p>
            {isYours ? (
              <span className="rounded-full bg-chartreuse/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-chartreuse">
                yours
              </span>
            ) : null}
            {item.idCheckRequired && !acked ? (
              <span className="rounded-full bg-coral/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-coral">
                ⚠ check ID
              </span>
            ) : null}
          </div>
          <p className="text-sm text-oat/60">{REQUEST_LABEL[item.type]}</p>
          {item.note ? (
            <p className="mt-2 text-sm italic leading-snug text-oat/50">
              &ldquo;{item.note}&rdquo;
            </p>
          ) : null}
        </div>
        <span
          className={[
            "shrink-0 font-mono text-base tabular-nums",
            delayed ? "text-coral" : warning ? "text-oat" : "text-oat/60",
          ].join(" ")}
        >
          {formatAge(seconds)}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        {acked ? (
          <span className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-chartreuse/10 py-3 text-sm font-medium text-chartreuse">
            <span className="h-1.5 w-1.5 rounded-full bg-chartreuse" />
            {item.acknowledgedBy?.name ? `${item.acknowledgedBy.name} on it` : "Acknowledged"}
          </span>
        ) : (
          <button
            disabled={busy}
            onClick={onAck}
            className="flex-1 rounded-lg bg-chartreuse py-3 text-sm font-medium text-slate disabled:opacity-60"
          >
            Got it
          </button>
        )}
        {ackedByMe && others.length > 0 ? (
          <button
            disabled={busy}
            onClick={() => setShowHandoff(s => !s)}
            className="rounded-lg border border-white/10 px-3 py-3 text-sm font-medium text-oat/70 hover:text-oat disabled:opacity-60"
          >
            Hand off
          </button>
        ) : null}
        <button
          disabled={busy}
          onClick={() => setShowResolveActions(s => !s)}
          className="rounded-lg border border-white/10 px-4 py-3 text-sm font-medium text-oat/70 hover:text-oat disabled:opacity-60"
        >
          Done
        </button>
      </div>

      {showResolveActions ? (
        <div className="mt-3 rounded-xl border border-white/5 bg-slate p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-oat/50">What did you do?</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { id: "SERVED", label: "Served" },
              { id: "COMPED", label: "Comped" },
              { id: "REFUSED", label: "Refused" },
              { id: "ESCALATED", label: "Escalated" },
              { id: "NOT_ACTIONABLE", label: "Stale" },
              { id: "OTHER", label: "Other" },
            ].map(a => (
              <li key={a.id}>
                <button
                  disabled={busy}
                  onClick={() => { setShowResolveActions(false); onResolve(a.id); }}
                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-oat/80 hover:bg-white/5 disabled:opacity-60"
                >
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setShowResolveActions(false)}
            className="mt-2 text-[11px] text-oat/45 underline-offset-4 hover:text-oat hover:underline"
          >
            cancel
          </button>
        </div>
      ) : null}

      {showHandoff && ackedByMe ? (
        <div className="mt-3 rounded-xl border border-white/5 bg-slate p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-oat/50">
            Hand off to
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {others.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { onHandoff(s.id); setShowHandoff(false); }}
                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-oat hover:bg-slate-light disabled:opacity-60"
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function useAge(iso: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(h);
  }, []);
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

function formatAge(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
