"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { configureSocketAuth, getSocket, joinRoom, resetSocket } from "@/lib/socket";

const REQUEST_TYPES = [
  { id: "DRINK",  label: "Order a drink" },
  { id: "BILL",   label: "Get the bill"  },
  { id: "HELP",   label: "Need help"     },
  { id: "REFILL", label: "Refill"        },
] as const;

type RequestType = (typeof REQUEST_TYPES)[number]["id"];
type Status = "idle" | "submitting" | "sent" | "ack" | "error" | "rate_limited";

type PrevTab = { itemCount: number; lastRequestMinAgo: number | null };

export function GuestRequestPanel({
  sessionId,
  sessionToken,
  slug,
  tableLabel,
  prevTab = null,
}: {
  sessionId: string;
  sessionToken: string;
  slug: string;
  tableLabel: string;
  prevTab?: PrevTab | null;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [activeType, setActiveType] = useState<RequestType | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prev, setPrev] = useState<PrevTab | null>(prevTab);
  const [closingTab, setClosingTab] = useState(false);

  useEffect(() => {
    // Configure socket auth as the guest before any join — passes the
    // session's secret token so the realtime server can verify the room
    // belongs to us.
    configureSocketAuth(async () => {
      try {
        const r = await fetch("/api/realtime/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestSessionId: sessionId, sessionToken }),
        });
        if (!r.ok) return null;
        const body = await r.json();
        return typeof body?.token === "string" ? body.token : null;
      } catch { return null; }
    });
    const leave = joinRoom({ guestSessionId: sessionId });
    const socket = getSocket();
    function onAck(payload: { request?: { id: string } } | null) {
      const id = payload?.request?.id;
      if (!id) return;
      if (lastRequestId && id !== lastRequestId) return;
      setStatus("ack");
    }
    socket.on("request_acknowledged", onAck);
    return () => {
      socket.off("request_acknowledged", onAck);
      leave();
      // Tear down the connection — its claims are scoped to this guest
      // session. If the user navigates to a different table/session in
      // the same tab, the next page configures its own fetcher and the
      // socket reconnects with fresh claims.
      resetSocket();
    };
  }, [sessionId, sessionToken, lastRequestId]);

  async function submit(type: RequestType) {
    if (status === "submitting") return;
    setStatus("submitting");
    setActiveType(type);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, type }),
      });
      if (res.status === 429) {
        setStatus("rate_limited");
        setErrorMsg("Just a moment — wait 30 seconds before sending another.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      setLastRequestId(body?.id ?? null);
      setStatus("sent");
      // Special case: BILL request → take guest to bill screen.
      if (type === "BILL") {
        setTimeout(() => {
          window.location.href = `/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill`;
        }, 600);
      }
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  function reset() {
    setStatus("idle");
    setActiveType(null);
    setLastRequestId(null);
    setErrorMsg(null);
  }

  async function startFresh() {
    if (closingTab) return;
    setClosingTab(true);
    try {
      const res = await fetch(`/api/session/${sessionId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Reload — the server will spin up a new GuestSession on next render.
      window.location.reload();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't reset the tab.");
      setClosingTab(false);
    }
  }

  if (status === "sent" || status === "ack") {
    const acknowledged = status === "ack";
    return (
      <section className="px-6">
        <div
          className={[
            "rounded-2xl border p-8 text-center transition-colors",
            acknowledged ? "border-chartreuse/40 bg-chartreuse/20" : "border-slate/10 bg-white",
          ].join(" ")}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-umber">
            {acknowledged ? "Acknowledged" : "Request sent"}
          </p>
          <h2 className="mt-3 text-2xl font-medium text-slate">
            {acknowledged ? "Staff is on the way" : "Sent. We&rsquo;re alerting your server."}
          </h2>
          <p className="mt-2 text-sm text-slate/60">
            {acknowledged
              ? "Someone just acknowledged your request."
              : "You'll see a confirmation here when it's seen."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="text-sm font-medium text-umber underline-offset-4 hover:underline"
            >
              Send another request
            </button>
            <Link
              href={`/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill`}
              className="text-sm text-slate/60 hover:text-slate"
            >
              View running tab →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 px-6">
      {prev ? (
        <div className="rounded-2xl border border-sea/40 bg-sea/20 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            This tab has items from earlier
          </p>
          <p className="mt-1 text-sm text-slate/75">
            {prev.itemCount} item{prev.itemCount === 1 ? "" : "s"}
            {prev.lastRequestMinAgo !== null
              ? ` · last activity ${prev.lastRequestMinAgo}m ago`
              : ""}
            . Pick up where you left off, or start a fresh tab — the old
            items stay with the previous guest.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPrev(null)}
              className="rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-sm font-medium text-slate hover:border-slate/30"
            >
              Continue this tab
            </button>
            <button
              type="button"
              onClick={startFresh}
              disabled={closingTab}
              className="rounded-lg bg-chartreuse px-3 py-1.5 text-sm font-medium text-slate disabled:opacity-60"
            >
              {closingTab ? "Resetting…" : "Start a fresh tab"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {REQUEST_TYPES.map((rt) => {
          const isActive = activeType === rt.id && status === "submitting";
          return (
            <button
              key={rt.id}
              type="button"
              disabled={status === "submitting"}
              onClick={() => submit(rt.id)}
              className={[
                "min-h-[96px] rounded-2xl border bg-white px-4 py-5 text-left text-base font-medium text-slate transition-all",
                "active:scale-[0.98] disabled:opacity-60",
                isActive ? "border-chartreuse ring-2 ring-chartreuse/40" : "border-slate/10 hover:border-slate/20",
              ].join(" ")}
            >
              {rt.label}
            </button>
          );
        })}
      </div>

      {errorMsg ? (
        <p
          className={[
            "mt-4 rounded-lg px-3 py-2 text-center text-sm",
            status === "rate_limited" ? "bg-coral/20 text-coral" : "bg-coral/10 text-coral",
          ].join(" ")}
        >
          {errorMsg}
        </p>
      ) : null}

      <div className="mt-8 text-center">
        <Link
          href={`/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill`}
          className="text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
        >
          View running tab →
        </Link>
      </div>
    </section>
  );
}
