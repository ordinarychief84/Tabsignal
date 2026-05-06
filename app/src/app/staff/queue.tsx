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

// Safety-net poll interval — covers socket reconnect gaps. Real-time pushes
// (new_request / request_acknowledged / request_resolved) carry the load.
const POLL_INTERVAL_MS = 30_000;

export function StaffQueue({ venueId }: { venueId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
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
      // swallow — next event or poll will reconcile
    }
  }, [venueId]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    const leave = joinRoom({ venueId });
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

  async function ack(id: string) {
    setPendingId(id);
    try {
      await fetch(`/api/requests/${id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      setItems(prev =>
        prev.map(it =>
          it.id === id
            ? { ...it, status: "ACKNOWLEDGED", acknowledgedAt: new Date().toISOString() }
            : it
        )
      );
    } finally {
      setPendingId(null);
    }
  }

  async function resolve(id: string) {
    setPendingId(id);
    try {
      await fetch(`/api/requests/${id}/resolve`, { method: "PATCH" });
      setItems(prev => prev.filter(it => it.id !== id));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {reconnecting ? (
        <div className="mb-3 rounded-lg bg-coral/10 px-3 py-2 text-center text-xs text-coral">
          Reconnecting…
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-slate-light/40 px-6 py-10 text-center">
          <p className="text-sm text-oat/60">Floor is quiet.</p>
          <p className="mt-1 text-[11px] tracking-wide text-oat/30">
            New requests appear here within 1 second.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(it => (
            <RequestCard
              key={it.id}
              item={it}
              busy={pendingId === it.id}
              onAck={() => ack(it.id)}
              onResolve={() => resolve(it.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function RequestCard({
  item,
  busy,
  onAck,
  onResolve,
}: {
  item: Item;
  busy: boolean;
  onAck: () => void;
  onResolve: () => void;
}) {
  const acked = item.status === "ACKNOWLEDGED";
  const seconds = useAge(item.createdAt);
  const delayed = seconds > 180;
  const warning = !delayed && seconds > 60;

  return (
    <li
      className={[
        "rounded-2xl border bg-slate-light p-4 transition-colors",
        delayed ? "border-coral ring-1 ring-coral/30" : warning ? "border-sea/40" : "border-white/5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-medium text-oat">{item.tableLabel}</p>
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
        <button
          disabled={busy}
          onClick={onResolve}
          className="rounded-lg border border-white/10 px-4 py-3 text-sm font-medium text-oat/70 hover:text-oat disabled:opacity-60"
        >
          Done
        </button>
      </div>
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
