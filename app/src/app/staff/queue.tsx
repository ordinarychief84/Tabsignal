"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, joinRoom } from "@/lib/socket";
// `formatAge` here takes milliseconds; the one further down this file
// takes seconds and is used for the per-row timers. Aliased rather than
// merged so neither caller has to think about which unit it is getting.
import { computeMultiCall, formatAge as formatAgeMs } from "@/lib/staff/multi-call";
import {
  SERVICE_THRESHOLD_DEFAULTS,
  URGENCY_LABEL,
  urgencyFor,
  type ServiceThresholds,
} from "@/lib/service-sla";

type Item = {
  id: string;
  tableId?: string;
  tableLabel: string;
  type: "DRINK" | "BILL" | "HELP" | "REFILL" | "ORDER" | "CELEBRATION" | "CLEAN" | "SUPPLIES";
  note: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "ON_MY_WAY" | "RESOLVED" | "ESCALATED";
  idCheckRequired?: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
  resolvedAt?: string | null;
  escalatedAt?: string | null;
  resolutionAction?: string | null;
};

type Tab = "pending" | "active" | "completed" | "delayed";

// "Check", not "Bill": the guest is signalling they want to close out.
// TabCall doesn't hold the money — the server takes it on the venue's own
// terminal — so the wording says what the server has to DO.
const REQUEST_LABEL: Record<Item["type"], string> = {
  DRINK: "Drink",
  BILL: "Check",
  HELP: "Help",
  REFILL: "Refill",
  ORDER: "Ready to order",
  CELEBRATION: "Celebrating",
  CLEAN: "Clear the table",
  SUPPLIES: "Supplies",
};

// Safety-net poll interval — covers socket reconnect gaps. Real-time pushes
// (new_request / request_acknowledged / request_resolved) carry the load.
const POLL_INTERVAL_MS = 30_000;

type StaffMate = { id: string; name: string };

/**
 * Multi-call: two or more of YOUR tables waiting at once.
 *
 * Salvaged from PR #42, which was opened in May and then sat behind three
 * months of unrelated churn. The detection is a pure function with its own
 * tests; only the wiring below is new, rebuilt against the current queue
 * rather than merging a branch that also rewrote auth routes since
 * replaced.
 *
 * The cue exists to break single-table tunnel vision when the floor is
 * busy — a drink at T4 and a check at T12 landing in the same minute
 * should feel different from either one alone.
 */
export function StaffQueue({
  venueId,
  venueSlug: venueSlugProp,
  staffId,
  assignedTableIds = [],
}: {
  venueId: string;
  venueSlug?: string;
  staffId?: string;
  assignedTableIds?: string[];
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // The venue's own promise, sent with every poll. Starts at the shipped
  // defaults so the first paint isn't blank, then follows the venue.
  const [thresholds, setThresholds] = useState<ServiceThresholds>(
    SERVICE_THRESHOLD_DEFAULTS,
  );
  // Per-row failure, so a retry sits next to the button that failed
  // rather than as a page-level banner the server has to hunt for.
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [filter, setFilter] = useState<"yours" | "all">(
    assignedTableIds.length > 0 ? "yours" : "all"
  );
  const [tab, setTab] = useState<Tab>("pending");
  // Force a re-render every 15s so the "delayed" bucket bumps when
  // requests cross the 90s threshold without waiting for the next event.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
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
  // Wishlist shared by a guest. Coral card at the top of the page; auto-
  // dismisses after 60s. Click "View" to deep-link into Live Requests.
  const [wishlistToast, setWishlistToast] = useState<{
    wishlistId: string;
    tableLabel: string | null;
    itemCount: number;
    items: { name: string; priceCents: number; quantity: number }[];
  } | null>(null);
  // Orders a guest sent from the table. Shown as a dismissible stack
  // rather than folded into the request queue: a request is something to
  // respond to, an order is something to run — different jobs, and mixing
  // them would make the queue counts lie.
  const [orderToasts, setOrderToasts] = useState<{
    id: string;
    tableLabel: string | null;
    itemCount: number;
    items: { nameSnapshot: string; quantity: number; notes: string | null }[];
  }[]>([]);
  const aborter = useRef<AbortController | null>(null);
  const assignedSet = new Set(assignedTableIds);
  // One shared clock for the multi-call ages.
  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Recomputed each render off the same `items` the list uses, so the
  // banner can never disagree with the rows underneath it.
  const multiCall = computeMultiCall(
    items.map(i => ({
      id: i.id,
      tableId: i.tableId,
      tableLabel: i.tableLabel,
      type: i.type,
      status: i.status,
      createdAt: i.createdAt,
    })),
    assignedSet,
    // Ticks with the per-row timers already in this component, so the
    // banner's ages advance with them rather than freezing until the next
    // refresh.
    tickNow,
  );

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
      if (data.thresholds) setThresholds(data.thresholds);
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

    // Another device — a shared tablet, this server's watch — said they
    // are walking over. Repaint rather than leave the card claimed.
    function onOnMyWayEvent({ request }: { request: { id: string; onMyWayAt?: string | null } }) {
      setItems(prev =>
        prev.map(it =>
          it.id === request.id ? { ...it, status: "ON_MY_WAY" as const } : it,
        ),
      );
    }

    function onResolved({ request }: { request: { id: string; resolvedAt?: string; resolutionAction?: string | null } }) {
      if (!request) return;
      // Keep RESOLVED items in state for the Completed tab — drop only
      // after an hour client-side to bound memory. Server is the source
      // of truth via the next /requests/live refresh.
      setItems(prev =>
        prev.map(i =>
          i.id === request.id
            ? {
                ...i,
                status: "RESOLVED",
                resolvedAt: request.resolvedAt ?? new Date().toISOString(),
                resolutionAction: request.resolutionAction ?? i.resolutionAction ?? null,
              }
            : i
        )
      );
    }

    function onEscalated({ id, escalatedAt }: { id: string; escalatedAt?: string }) {
      if (!id) return;
      setItems(prev =>
        prev.map(i =>
          i.id === id
            ? { ...i, status: "ESCALATED", escalatedAt: escalatedAt ?? new Date().toISOString() }
            : i
        )
      );
    }

    function onDisconnect() { setReconnecting(true); }
    function onConnect() { setReconnecting(false); refresh(); }
    function onHandedOffToYou(payload: { request?: { tableLabel: string; type: string; fromStaffId: string | null } } | null) {
      const r = payload?.request;
      if (!r) return;
      setHandoffToast(`${r.tableLabel} · ${r.type.toLowerCase()} handed off to you`);
      // Auto-clear after 4s.
      setTimeout(() => setHandoffToast(null), 4000);
      refresh();
    }

    function onOrderPlaced(payload: {
      order?: {
        id: string;
        tableLabel: string | null;
        itemCount: number;
        items: { nameSnapshot: string; quantity: number; notes: string | null }[];
      };
    } | null) {
      const o = payload?.order;
      if (!o?.id) return;
      setOrderToasts(curr => (curr.some(t => t.id === o.id) ? curr : [o, ...curr].slice(0, 4)));
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([12, 50, 12]);
      } catch { /* iOS Safari */ }
    }

    function onWishlistShared(payload: {
      wishlistId?: string;
      tableLabel?: string | null;
      itemCount?: number;
      items?: { name: string; priceCents: number; quantity: number }[];
    } | null) {
      if (!payload?.wishlistId) return;
      const toast = {
        wishlistId: payload.wishlistId,
        tableLabel: payload.tableLabel ?? null,
        itemCount: payload.itemCount ?? (payload.items?.length ?? 0),
        items: payload.items ?? [],
      };
      setWishlistToast(toast);
      // Auto-dismiss after 60s — the staff member's chance to act on it.
      setTimeout(
        () => setWishlistToast(curr => (curr?.wishlistId === toast.wishlistId ? null : curr)),
        60_000
      );
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
    socket.on("request_on_my_way", onOnMyWayEvent);
    socket.on("request_resolved", onResolved);
    socket.on("request_escalated", onEscalated);
    socket.on("request_handed_off_to_you", onHandedOffToYou);
    socket.on("regular_arrived_for_you", onRegularArrivedForYou);
    socket.on("order_placed", onOrderPlaced);
    socket.on("order_placed_for_you", onOrderPlaced);
    socket.on("wishlist_shared", onWishlistShared);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      clearInterval(poll);
      leave();
      socket.off("new_request", onNew);
      socket.off("request_acknowledged", onAck);
      socket.off("request_on_my_way", onOnMyWayEvent);
      socket.off("request_resolved", onResolved);
      socket.off("request_escalated", onEscalated);
      socket.off("request_handed_off_to_you", onHandedOffToYou);
      socket.off("regular_arrived_for_you", onRegularArrivedForYou);
      socket.off("order_placed", onOrderPlaced);
      socket.off("order_placed_for_you", onOrderPlaced);
      socket.off("wishlist_shared", onWishlistShared);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      aborter.current?.abort();
    };
  }, [venueId, staffId, refresh]);

  // Lazy-load the slim staff list once for the handoff popover. Uses
  // /api/staff/mates (id + name only) instead of /api/admin/staff so we
  // don't ship the full roster's email / lastSeenAt to every floor user.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/mates")
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => { if (!cancelled) setStaffMates((d.items ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))); })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, []);

  // Pre-filter by Yours/All before bucketing into tabs.
  const yoursOrAll =
    filter === "yours"
      ? items.filter(i => !i.tableId || assignedSet.has(i.tableId))
      : items;
  const yourCount = items.filter(i => i.tableId && assignedSet.has(i.tableId)).length;

  const now = Date.now();
  function bucketFor(it: Item): Tab {
    if (it.status === "RESOLVED") return "completed";
    if (it.status === "ESCALATED") return "delayed";
    // Claimed and walking-over are both active work. Without the second
    // one an ON_MY_WAY request falls through to the age check and gets
    // flagged delayed while somebody is mid-stride toward the table.
    if (it.status === "ACKNOWLEDGED" || it.status === "ON_MY_WAY") return "active";
    // PENDING — promote to "delayed" tab visually if it's older than 90s
    // (the server-side cron flips status=ESCALATED at 3min; between 90s
    // and 3min the row stays PENDING but appears under Delayed too).
    const age = now - new Date(it.createdAt).getTime();
    return age >= thresholds.attentionSeconds * 1000 ? "delayed" : "pending";
  }

  const bucketCounts = { pending: 0, active: 0, completed: 0, delayed: 0 } as Record<Tab, number>;
  for (const it of yoursOrAll) bucketCounts[bucketFor(it)] += 1;

  const visibleItems = yoursOrAll.filter(it => bucketFor(it) === tab);

  async function ack(id: string) {
    setPendingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/requests/${id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      // A failed response used to fall through and set the row to
      // ACKNOWLEDGED anyway, so a server on bad wifi saw a card that
      // looked claimed while the guest was still waiting on nobody.
      // `alreadyAcked` is not a failure — someone else got there first,
      // and the body carries who.
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (!err?.alreadyAcked) {
          throw new Error(err?.detail ?? err?.error ?? `HTTP ${res.status}`);
        }
      }
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
    } catch (e) {
      setActionError({
        id,
        message: e instanceof Error && /Failed to fetch/i.test(e.message)
          ? "No connection. Try again."
          : "Couldn't update that. Try again.",
      });
    } finally {
      setPendingId(null);
    }
  }

  /**
   * "I'm walking over."
   *
   * The step that earns the guest-facing line. Acknowledging claims the
   * request; this is what changes the guest's screen from "has got you"
   * to "is on the way", so it must never be fired automatically or
   * merged into Got it.
   */
  async function onMyWay(id: string) {
    setPendingId(id);
    setActionError(null);
    // Optimistic, because this is pressed mid-stride and the server
    // should not have to watch a spinner. Rolled back on failure below.
    const previous = items;
    setItems(prev =>
      prev.map(it => (it.id === id ? { ...it, status: "ON_MY_WAY" as const } : it)),
    );
    try {
      const res = await fetch(`/api/requests/${id}/on-my-way`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setItems(prev =>
        prev.map(it =>
          it.id === id
            ? { ...it, status: (body.status as Item["status"]) ?? "ON_MY_WAY" }
            : it,
        ),
      );
    } catch {
      // Put it back. Leaving it green would tell this server the guest
      // has been told something the guest was never told.
      setItems(previous);
      setActionError({ id, message: "Couldn't tell them you're coming. Try again." });
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

  // Empty copy has to describe what is actually empty — see the note at
  // the render site. Two axes, and both have caught this out:
  //
  //   FILTER: "Floor is quiet" is a claim about the venue, so it needs
  //           `items`, not the filtered set.
  //   TAB:    "Nothing on your tables" is a claim about ALL your work,
  //           so it needs every open request of yours, not just the ones
  //           in the selected bucket. Without this the Pending tab said
  //           nothing needed you while the Active tab held a live
  //           request — which sends a server away from a waiting table.
  const yoursOpen = items.filter(
    it =>
      it.status !== "RESOLVED" &&
      (!showFilter || !it.tableId || assignedTableIds.includes(it.tableId)),
  ).length;

  const emptyMessage =
    showFilter && filter === "yours" && yoursOpen === 0
      ? "Nothing on your tables right now."
      : items.length === 0
        ? "Floor is quiet."
        : tab === "pending"
          ? "Nothing pending — everything open has been picked up."
          : tab === "active"
            ? "Nothing in progress right now."
            : tab === "delayed"
              ? "Nothing is running late. Good shift."
              : "Nothing completed yet this shift.";

  return (
    <>
      {/* Only when 2+ of your OWN tables are waiting. One table calling is
          just the queue doing its job and doesn't need shouting about. */}
      {multiCall.count >= 2 ? (
        <section
          role="alert"
          aria-live="assertive"
          className="mb-3 rounded-2xl border-2 border-coral bg-coral/10 px-4 py-3"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-coral">
            {multiCall.count} of your tables are waiting
          </p>
          <ul className="mt-2 space-y-1">
            {multiCall.tables.map(t => (
              <li key={t.tableId} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-slate">
                  {t.tableLabel}
                  <span className="ml-2 text-[12px] font-normal text-slate/60">
                    {REQUEST_LABEL[t.oldestRequestType as Item["type"]] ?? t.oldestRequestType}
                    {t.openCount > 1 ? ` +${t.openCount - 1}` : ""}
                  </span>
                </span>
                {/* Oldest first, so the top row is the one to walk to. */}
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-coral">
                  {formatAgeMs(t.oldestAgeMs)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {orderToasts.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {orderToasts.map(o => (
            <li
              key={o.id}
              className="rounded-2xl border border-chartreuse bg-chartreuse/25 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate/70">
                    Order in
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate">
                    {o.tableLabel ?? "A table"} · {o.itemCount}{" "}
                    {o.itemCount === 1 ? "item" : "items"}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {o.items.map((it, i) => (
                      <li key={i} className="text-[12px] text-slate/75">
                        {it.quantity > 1 ? `${it.quantity}× ` : ""}
                        {it.nameSnapshot}
                        {it.notes ? <span className="text-slate/55"> — {it.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderToasts(curr => curr.filter(t => t.id !== o.id))}
                  className="shrink-0 rounded-lg border border-slate/20 px-3 py-1.5 text-[11px] font-medium text-slate hover:bg-slate/5"
                >
                  Got it
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {wishlistToast ? (
        <div className="mb-3 rounded-2xl border border-coral/40 bg-coral/15 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-coral">
                Wishlist shared
              </p>
              <p className="mt-1 text-sm text-slate">
                <span className="font-medium">{wishlistToast.tableLabel ?? "A guest"}</span>
                {" "}shared a wishlist of {wishlistToast.itemCount} item{wishlistToast.itemCount === 1 ? "" : "s"}
              </p>
              {wishlistToast.items.length > 0 ? (
                <p className="mt-1 truncate text-[11px] text-slate/60">
                  {wishlistToast.items.map(i => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.name}`).join(", ")}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {venueSlugProp ? (
                <a
                  href={`/admin/v/${venueSlugProp}/requests?wishlist=${encodeURIComponent(wishlistToast.wishlistId)}`}
                  className="rounded-md border border-coral/40 bg-coral/20 px-2 py-1 text-[11px] font-medium text-coral hover:bg-coral/30"
                >
                  View
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setWishlistToast(null)}
                aria-label="Dismiss"
                className="rounded-full border border-coral/30 px-2 py-0.5 text-[11px] text-coral"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reconnecting ? (
        <div className="mb-3 rounded-lg bg-sea/20 px-3 py-2 text-center text-xs text-slate/70">
          Reconnecting…
        </div>
      ) : null}

      {showFilter ? (
        <div className="mb-3 inline-flex rounded-xl border border-umber-soft/40 p-1 text-[11px]">
          <button
            type="button"
            onClick={() => setFilter("yours")}
            className={[
              "min-h-[40px] rounded-lg px-3.5 font-medium transition-colors",
              filter === "yours" ? "bg-chartreuse text-slate" : "text-slate/60 hover:text-slate",
            ].join(" ")}
          >
            Your tables · {yourCount}
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={[
              "min-h-[40px] rounded-lg px-3.5 font-medium transition-colors",
              filter === "all" ? "bg-chartreuse text-slate" : "text-slate/60 hover:text-slate",
            ].join(" ")}
          >
            All · {items.length}
          </button>
        </div>
      ) : null}

      {/* Status tabs — Pending / Active / Delayed / Completed.
        * "Delayed" lights coral when populated (escalated server-side or
        * PENDING > 90s). "Completed" shows resolved requests for the last
        * hour so staff can audit what just happened.
        */}
      <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
        {([
          { id: "pending",   label: "Pending"   },
          { id: "active",    label: "Active"    },
          { id: "delayed",   label: "Delayed"   },
          { id: "completed", label: "Completed" },
        ] as { id: Tab; label: string }[]).map(t => {
          const count = bucketCounts[t.id];
          const isDelayed = t.id === "delayed" && count > 0;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                // 40px minimum. These are tapped mid-service, often with
                // wet hands; 29px was a target sized for a mouse.
                "min-h-[40px] rounded-lg border px-3.5 font-medium transition-colors",
                isActive
                  ? (isDelayed ? "border-coral bg-coral text-slate" : "border-chartreuse bg-chartreuse text-slate")
                  : (isDelayed ? "border-coral/40 text-coral hover:border-coral" : "border-umber-soft/40 text-slate/60 hover:text-slate"),
              ].join(" ")}
            >
              {t.label} · {count}
            </button>
          );
        })}
      </div>

      {/* The empty state has to describe the FILTER, not the venue. Saying
          "Floor is quiet" while the Active tab shows a live request sends a
          server away from a table that is waiting on them — so the venue-wide
          phrasing is reserved for when every tab really is empty. */}
      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-umber-soft/30 bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate/60">{emptyMessage}</p>
          <p className="mt-1 text-[11px] tracking-wide text-slate/40">
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
              thresholds={thresholds}
              error={actionError?.id === it.id ? actionError.message : null}
              onDismissError={() => setActionError(null)}
              onAck={() => ack(it.id)}
              onOnMyWay={() => onMyWay(it.id)}
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
  thresholds,
  error,
  onDismissError,
  onAck,
  onOnMyWay,
  onResolve,
  onHandoff,
}: {
  item: Item;
  isYours: boolean;
  busy: boolean;
  currentStaffId?: string;
  staffMates: StaffMate[];
  /** Set when the last action on THIS row failed. §46: never silent. */
  error: string | null;
  onDismissError: () => void;
  thresholds: ServiceThresholds;
  onAck: () => void;
  onOnMyWay: () => void;
  onResolve: (action: string, note?: string) => void;
  onHandoff: (toStaffId: string) => void;
}) {
  const acked = item.status === "ACKNOWLEDGED";
  const onMyWay = item.status === "ON_MY_WAY";
  // "Claimed by me" covers both post-ack states — losing the handoff and
  // resolve controls the moment someone says they're walking over would
  // strand the request.
  const ackedByMe =
    (acked || onMyWay) && !!currentStaffId && item.acknowledgedBy?.id === currentStaffId;
  const seconds = useAge(item.createdAt);
  // Against the venue's own promise, not a number compiled in. §21 also
  // requires the state to be readable without colour, so `urgency` drives
  // a printed label as well as the border.
  // Urgency describes an UNANSWERED request. Once somebody has claimed
  // it the clock still runs — a manager wants the real number — but the
  // card stops shouting: "Overdue" beside a card that says a named
  // server is on their way is the product arguing with itself, and it
  // sends a second server to a table that already has one coming.
  const claimed = acked || onMyWay;
  const urgency = claimed ? "waiting" : urgencyFor(seconds, thresholds);
  const delayed = urgency === "overdue";
  const warning = urgency === "warn" || urgency === "attention";
  const [showHandoff, setShowHandoff] = useState(false);
  const [showResolveActions, setShowResolveActions] = useState(false);
  const others = staffMates.filter(s => s.id !== currentStaffId);

  return (
    <li
      className={[
        "rounded-2xl border bg-white shadow-card p-4 transition-colors",
        delayed ? "border-coral ring-1 ring-coral/30" : warning ? "border-sea/40" : isYours ? "border-chartreuse/40" : "border-umber-soft/30",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-medium text-slate">{item.tableLabel}</p>
            {isYours ? (
              <span className="rounded-full bg-chartreuse px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate">
                yours
              </span>
            ) : null}
            {item.idCheckRequired && !acked ? (
              <span className="rounded-full bg-coral/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-coral">
                ⚠ check ID
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate/60">{REQUEST_LABEL[item.type]}</p>
          {item.note ? (
            <p className="mt-2 text-sm italic leading-snug text-slate/55">
              &ldquo;{item.note}&rdquo;
            </p>
          ) : null}
        </div>
        <span
          className={[
            "flex shrink-0 flex-col items-end",
            delayed ? "text-coral" : warning ? "text-slate" : "text-slate/60",
          ].join(" ")}
        >
          <span className="font-mono text-base tabular-nums">{formatAge(seconds)}</span>
          {/* §21: urgency in words as well as colour. A card shaded coral
              means nothing to someone who can't see coral, and this gets
              read in a dim room at speed. Hidden while a request is fresh
              — "Waiting, 0:04" is noise. */}
          {urgency !== "waiting" ? (
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {URGENCY_LABEL[urgency]}
            </span>
          ) : null}
        </span>
      </div>

      {/* §46: a failed action must say so and offer another go. The
          state was rolled back before this rendered, so the buttons
          below are already showing the real, unchanged status. */}
      {error ? (
        <p
          role="alert"
          className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-clay/40 bg-clay-soft px-3 py-2 text-[13px] text-clay-deep"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="shrink-0 rounded px-2 py-1 text-[12px] font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        {/* Three states, one slot. Unclaimed offers Got it; claimed by ME
            offers the step that actually tells the guest somebody is
            coming; claimed by someone else is a status, not a control —
            pressing another server's request is how two people end up
            walking to the same table. */}
        {onMyWay ? (
          <span className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-mint py-3 text-sm font-medium text-mint-deep">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mint-deep" />
            {item.acknowledgedBy?.name ? `${item.acknowledgedBy.name} on the way` : "On the way"}
          </span>
        ) : acked && ackedByMe ? (
          <button
            disabled={busy}
            onClick={onOnMyWay}
            className="flex-1 rounded-lg bg-saffron py-3 text-sm font-semibold text-plum disabled:opacity-60"
          >
            On my way
          </button>
        ) : acked ? (
          <span className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-sea-soft/50 py-3 text-sm font-medium text-sea">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sea" />
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
            className="rounded-lg border border-umber-soft/40 px-3 py-3 text-sm font-medium text-slate/70 hover:text-slate disabled:opacity-60"
          >
            Hand off
          </button>
        ) : null}
        <button
          disabled={busy}
          onClick={() => setShowResolveActions(s => !s)}
          className="rounded-lg border border-umber-soft/40 px-4 py-3 text-sm font-medium text-slate/70 hover:text-slate disabled:opacity-60"
        >
          Done
        </button>
      </div>

      {showResolveActions ? (
        <div className="mt-3 rounded-xl border border-umber-soft/30 bg-white p-3 ring-1 ring-umber-soft/30">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate/55">What did you do?</p>
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
                  className="w-full rounded-lg border border-umber-soft/40 px-3 py-2 text-xs font-medium text-slate/80 hover:bg-slate/5 disabled:opacity-60"
                >
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setShowResolveActions(false)}
            className="mt-2 text-[11px] text-slate/50 underline-offset-4 hover:text-slate hover:underline"
          >
            cancel
          </button>
        </div>
      ) : null}

      {showHandoff && ackedByMe ? (
        <div className="mt-3 rounded-xl border border-umber-soft/30 bg-white p-3 ring-1 ring-umber-soft/30">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate/55">
            Hand off to
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {others.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { onHandoff(s.id); setShowHandoff(false); }}
                  className="w-full rounded-lg border border-umber-soft/40 px-3 py-2 text-sm text-slate hover:bg-slate/5 disabled:opacity-60"
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

/**
 * mm:ss, rolling over to h:mm past the hour.
 *
 * Without the rollover a request left open across a shift renders as
 * "194:20", which reads as a broken counter rather than as three hours.
 */
function formatAge(seconds: number): string {
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
