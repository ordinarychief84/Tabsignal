"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, joinRoom } from "@/lib/socket";

type Item = {
  id: string;
  tableLabel: string;
  type: "DRINK" | "BILL" | "HELP" | "REFILL" | "ORDER" | "CELEBRATION" | "CLEAN" | "SUPPLIES";
  note: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
};

// Tier 3e: regular_arrived payload from the realtime emit. Compact so
// the floor banner can show it without flooding the UI.
type RegularArrival = {
  sessionId: string;
  tableId: string | null;
  preview: {
    profileId: string;
    displayName: string | null;
    score: number;
    visits: number;
    recencyDays: number | null;
    topItem: string | null;
    pinnedNote: string | null;
    loyaltyPoints: number;
  };
};

const REQUEST_LABEL: Record<Item["type"], string> = {
  DRINK: "Drink",
  // "Check", not "Bill" — the guest is signalling they want to close out,
  // and the POS settles it.
  BILL: "Check",
  HELP: "Help",
  REFILL: "Refill",
  ORDER: "Ready to order",
  CELEBRATION: "Celebrating",
  CLEAN: "Clear the table",
  SUPPLIES: "Supplies",
};

export function ManagerFloor({ venueId, slug }: { venueId: string; slug: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [arrivals, setArrivals] = useState<RegularArrival[]>([]);
  const aborter = useRef<AbortController | null>(null);

  function dismissArrival(profileId: string) {
    setArrivals(curr => curr.filter(a => a.preview.profileId !== profileId));
  }

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
      /* swallow */
    }
  }, [venueId]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 30_000);
    const leave = joinRoom({ venueId });
    const socket = getSocket();

    function onNew({ request }: { request: Item }) {
      if (!request) return;
      setItems(prev => (prev.some(i => i.id === request.id) ? prev : [request, ...prev]));
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
              }
            : i
        )
      );
    }
    function onResolved({ request }: { request: { id: string } }) {
      setItems(prev => prev.filter(i => i.id !== request.id));
    }
    function onConnect() { setReconnecting(false); refresh(); }
    function onDisconnect() { setReconnecting(true); }
    function onRegularArrived(payload: RegularArrival | null) {
      if (!payload?.preview?.profileId) return;
      // Dedupe: replace existing arrival for the same profile if any.
      setArrivals(curr => [
        payload,
        ...curr.filter(a => a.preview.profileId !== payload.preview.profileId),
      ].slice(0, 5));
      // Auto-fade after 90s — long enough for the bartender to read,
      // short enough not to clutter the floor next round.
      setTimeout(() => dismissArrival(payload.preview.profileId), 90_000);
    }

    socket.on("new_request", onNew);
    socket.on("request_acknowledged", onAck);
    socket.on("request_resolved", onResolved);
    socket.on("regular_arrived", onRegularArrived);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      clearInterval(poll);
      leave();
      socket.off("new_request", onNew);
      socket.off("request_acknowledged", onAck);
      socket.off("request_resolved", onResolved);
      socket.off("regular_arrived", onRegularArrived);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      aborter.current?.abort();
    };
  }, [venueId, refresh]);

  const arrivalBanners = arrivals.length > 0 ? (
    <ul className="mb-3 space-y-2">
      {arrivals.map(a => (
        <li
          key={a.preview.profileId}
          className="flex items-start justify-between gap-3 rounded-2xl border border-saffron bg-service-pending px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Regular arrived</p>
            <p className="mt-1 text-sm font-medium text-slate">
              {a.preview.displayName ?? "Returning guest"}
              {" · "}
              <span className="text-slate/70">{a.preview.visits} visits</span>
              {a.preview.recencyDays !== null
                ? <span className="text-slate/50"> · last {a.preview.recencyDays === 0 ? "today" : `${a.preview.recencyDays}d ago`}</span>
                : null}
            </p>
            {a.preview.topItem ? (
              <p className="mt-0.5 text-xs text-slate/70">Usually orders <span className="font-medium">{a.preview.topItem}</span></p>
            ) : null}
            {a.preview.pinnedNote ? (
              <p className="mt-1 rounded bg-white/60 px-2 py-1 text-xs text-slate/80">
                {a.preview.pinnedNote}
              </p>
            ) : null}
            <a
              href={`/admin/v/${slug}/regulars/${a.preview.profileId}`}
              className="mt-2 inline-block text-[11px] text-umber underline-offset-4 hover:underline"
            >
              open dossier ↗
            </a>
          </div>
          <button
            onClick={() => dismissArrival(a.preview.profileId)}
            className="shrink-0 rounded-full border border-sandstone bg-surface px-2 py-0.5 text-[11px] text-graphite hover:border-line-strong"
            aria-label="Dismiss"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  if (items.length === 0) {
    return (
      <>
        {arrivalBanners}
        <div className="rounded-2xl border border-sandstone bg-surface px-5 py-10 text-center">
          <p className="text-sm text-slate/55">Floor is quiet.</p>
          <p className="mt-1 text-[11px] tracking-wide text-slate/35">
            New requests appear here within 1 second.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {arrivalBanners}
      {reconnecting ? (
        <div className="mb-3 rounded-lg bg-sea/30 px-3 py-2 text-center text-xs text-slate/70">
          Reconnecting…
        </div>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(it => (
          <FloorCard key={it.id} item={it} />
        ))}
      </ul>
    </>
  );
}

function FloorCard({ item }: { item: Item }) {
  const seconds = useAge(item.createdAt);
  const acked = item.status === "ACKNOWLEDGED";
  const delayed = !acked && seconds > 180;
  const warn = !acked && !delayed && seconds > 60;

  return (
    <li
      // §22: the card carries its status as a surface, not just a border —
      // new is soft Saffron, acknowledged Fresh Mint, overdue soft Rose
      // Clay. Colour is never the only signal: every state also prints its
      // own word below.
      className={[
        "rounded-2xl border p-5 transition-colors",
        acked
          ? "border-mint bg-service-acknowledged"
          : delayed
            ? "border-clay bg-service-overdue"
            : warn
              ? "border-saffron bg-service-pending"
              : "border-sandstone bg-surface",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xl font-medium text-plum">{item.tableLabel}</p>
          <p className="text-sm text-graphite">{REQUEST_LABEL[item.type]}</p>
        </div>
        <span
          className={[
            "font-mono text-base tabular-nums",
            delayed ? "text-clay-deep" : warn ? "text-saffron-deep" : "text-graphite",
          ].join(" ")}
        >
          {formatAge(seconds)}
        </span>
      </div>
      {item.note ? (
        <p className="mt-3 text-sm italic leading-snug text-graphite">
          &ldquo;{item.note}&rdquo;
        </p>
      ) : null}
      <p className="mt-4 text-[11px] tracking-wide">
        {acked ? (
          <span className="inline-flex items-center gap-2 text-mint-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-deep" />
            {item.acknowledgedBy?.name ? `${item.acknowledgedBy.name} on it` : "Acknowledged"}
          </span>
        ) : delayed ? (
          <span className="inline-flex items-center gap-2 text-clay-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-clay" />
            Delayed · escalate
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-graphite">
            <span className="h-1.5 w-1.5 rounded-full bg-graphite/40" />
            Waiting
          </span>
        )}
      </p>
    </li>
  );
}

function useAge(iso: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

function formatAge(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
