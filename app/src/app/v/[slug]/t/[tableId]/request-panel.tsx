"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSocket, joinRoom } from "@/lib/socket";

const REQUEST_TYPES = [
  { id: "DRINK",  label: "Order a drink" },
  { id: "BILL",   label: "Get the bill"  },
  { id: "HELP",   label: "Need help"     },
  { id: "REFILL", label: "Refill"        },
] as const;

type RequestType = (typeof REQUEST_TYPES)[number]["id"];
type Status = "idle" | "submitting" | "sent" | "ack" | "error" | "rate_limited";

export function GuestRequestPanel({
  sessionId,
  slug,
  tableLabel,
}: {
  sessionId: string;
  slug: string;
  tableLabel: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [activeType, setActiveType] = useState<RequestType | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
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
    };
  }, [sessionId, lastRequestId]);

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
    <section className="px-6">
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
