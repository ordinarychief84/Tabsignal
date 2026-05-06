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

export function StaffQueue({ venueId }: { venueId: string; staffId?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
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

    function onReconnect() {
      refresh();
    }

    socket.on("new_request", onNew);
    socket.on("request_acknowledged", onAck);
    socket.on("request_resolved", onResolved);
    socket.io.on("reconnect", onReconnect);

    return () => {
      clearInterval(poll);
      leave();
      socket.off("new_request", onNew);
      socket.off("request_acknowledged", onAck);
      socket.off("request_resolved", onResolved);
      socket.io.off("reconnect", onReconnect);
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
      // Optimistic update; the server's broadcast will reconcile other tabs.
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

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-100 p-8 text-center text-sm text-slate-500">
        No active requests. Floor is quiet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map(it => (
        <li
          key={it.id}
          className={[
            "rounded-2xl border bg-white p-4 shadow-sm",
            urgencyClass(it),
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-900">{it.tableLabel}</p>
              <p className="text-sm text-slate-700">{REQUEST_LABEL[it.type]}</p>
              {it.note ? <p className="mt-1 text-xs italic text-slate-500">&ldquo;{it.note}&rdquo;</p> : null}
            </div>
            <Age createdAt={it.createdAt} />
          </div>

          <div className="mt-4 flex gap-2">
            {it.status === "PENDING" ? (
              <button
                disabled={pendingId === it.id}
                onClick={() => ack(it.id)}
                className="flex-1 rounded-lg bg-chartreuse py-3 text-sm font-medium text-slate disabled:opacity-60"
              >
                Got it
              </button>
            ) : (
              <span className="flex-1 rounded-lg bg-emerald-50 py-3 text-center text-sm font-medium text-emerald-700">
                {it.acknowledgedBy?.name ? `${it.acknowledgedBy.name} on it` : "Acknowledged"}
              </span>
            )}
            <button
              disabled={pendingId === it.id}
              onClick={() => resolve(it.id)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              Done
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Age({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 5_000); return () => clearInterval(h); }, []);
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <span className="font-mono text-xs text-slate-500">{m}:{String(s).padStart(2, "0")}</span>;
}

function urgencyClass(it: Item): string {
  if (it.status === "ACKNOWLEDGED") return "border-emerald-300";
  const ageMs = Date.now() - new Date(it.createdAt).getTime();
  if (ageMs > 3 * 60_000) return "border-red-400 ring-1 ring-red-200 animate-pulse";
  if (ageMs > 60_000) return "border-amber-300";
  return "border-slate-200";
}
