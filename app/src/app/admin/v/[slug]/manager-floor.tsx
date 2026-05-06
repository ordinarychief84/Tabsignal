"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, joinRoom } from "@/lib/socket";

type Item = {
  id: string;
  tableLabel: string;
  type: "DRINK" | "BILL" | "HELP" | "REFILL";
  note: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
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

export function ManagerFloor({ venueId }: { venueId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const aborter = useRef<AbortController | null>(null);

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

    socket.on("new_request", onNew);
    socket.on("request_acknowledged", onAck);
    socket.on("request_resolved", onResolved);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      clearInterval(poll);
      leave();
      socket.off("new_request", onNew);
      socket.off("request_acknowledged", onAck);
      socket.off("request_resolved", onResolved);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      aborter.current?.abort();
    };
  }, [venueId, refresh]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate/10 bg-white px-5 py-10 text-center">
        <p className="text-sm text-slate/55">Floor is quiet.</p>
        <p className="mt-1 text-[11px] tracking-wide text-slate/35">
          New requests appear here within 1 second.
        </p>
      </div>
    );
  }

  return (
    <>
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
      className={[
        "rounded-2xl border bg-white p-5 transition-colors",
        acked ? "border-chartreuse/40" : delayed ? "border-coral ring-1 ring-coral/30" : warn ? "border-sea/60" : "border-slate/10",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xl font-medium text-slate">{item.tableLabel}</p>
          <p className="text-sm text-slate/55">{REQUEST_LABEL[item.type]}</p>
        </div>
        <span
          className={[
            "font-mono text-base tabular-nums",
            delayed ? "text-coral" : warn ? "text-slate" : "text-slate/55",
          ].join(" ")}
        >
          {formatAge(seconds)}
        </span>
      </div>
      {item.note ? (
        <p className="mt-3 text-sm italic leading-snug text-slate/55">
          &ldquo;{item.note}&rdquo;
        </p>
      ) : null}
      <p className="mt-4 text-[11px] tracking-wide">
        {acked ? (
          <span className="inline-flex items-center gap-2 text-umber">
            <span className="h-1.5 w-1.5 rounded-full bg-chartreuse" />
            {item.acknowledgedBy?.name ? `${item.acknowledgedBy.name} on it` : "Acknowledged"}
          </span>
        ) : delayed ? (
          <span className="inline-flex items-center gap-2 text-coral">
            <span className="h-1.5 w-1.5 rounded-full bg-coral" />
            Delayed · escalate
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-slate/45">
            <span className="h-1.5 w-1.5 rounded-full bg-slate/40" />
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
