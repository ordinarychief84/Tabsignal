"use client";

import { useEffect, useState } from "react";
import { getSocket, joinRoom } from "@/lib/socket";

const REQUEST_TYPES = [
  { id: "DRINK",  label: "Order a drink" },
  { id: "BILL",   label: "Get the bill" },
  { id: "HELP",   label: "Need help" },
  { id: "REFILL", label: "Refill" },
] as const;

type RequestType = (typeof REQUEST_TYPES)[number]["id"];
type Status = "idle" | "submitting" | "sent" | "ack" | "error" | "rate_limited";

export function GuestRequestPanel({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [activeType, setActiveType] = useState<RequestType | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stay subscribed to this session so any request acknowledgement fires the toast,
  // even if the guest reloaded after submitting.
  useEffect(() => {
    const leave = joinRoom({ guestSessionId: sessionId });
    const socket = getSocket();
    function onAck(payload: { request?: { id: string } } | null) {
      const id = payload?.request?.id;
      if (!id) return;
      // If we know the request id we just sent, only flip when it matches.
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
            "rounded-2xl p-6 text-center shadow-sm transition-colors",
            acknowledged ? "bg-emerald-50" : "bg-white",
          ].join(" ")}
        >
          <p className="text-3xl">{acknowledged ? "👋" : "✓"}</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            {acknowledged ? "Staff is on the way" : "Request sent"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {acknowledged
              ? "Someone just acknowledged your request."
              : "Your server has been notified."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 text-sm font-medium text-slate-500 underline-offset-2 hover:underline"
          >
            Send another request
          </button>
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
                "min-h-[88px] rounded-2xl border border-slate-200 bg-white px-4 py-5 text-left text-base font-medium text-slate-900 shadow-sm transition",
                "active:scale-[0.98] disabled:opacity-60",
                isActive ? "ring-2 ring-sea" : "hover:bg-slate-50",
              ].join(" ")}
            >
              {rt.label}
            </button>
          );
        })}
      </div>

      {errorMsg ? (
        <p className="mt-4 text-center text-sm text-red-600">{errorMsg}</p>
      ) : null}
    </section>
  );
}
