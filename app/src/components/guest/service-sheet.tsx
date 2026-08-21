"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Need Sarah?" — the one control that stays reachable everywhere.
 *
 * A guest raising a hand is the whole product, so this is deliberately the
 * only persistently docked thing in the experience. It names the server
 * when the table has one, because "Need Sarah?" reads like asking a person
 * and "Call waiter" reads like operating a machine.
 *
 * The confirmation afterwards is careful about what it claims. Sending a
 * request means the server was NOTIFIED. It does not mean they're walking
 * over — that only becomes true when they acknowledge, which arrives
 * separately. Telling a guest "she's on her way" before that is a promise
 * the product can't keep, and a guest who believes it waits longer before
 * asking again.
 */

export type ServiceOption = {
  id: string;
  /** RequestType sent to the API. */
  type: "HELP" | "REFILL" | "ORDER" | "BILL" | "CELEBRATION" | "DRINK" | "CLEAN" | "SUPPLIES";
  label: string;
  emoji: string;
};

export const SERVICE_OPTIONS: ServiceOption[] = [
  { id: "come_by", type: "HELP", label: "Come by when you can", emoji: "👋" },
  { id: "water", type: "REFILL", label: "Water / refill", emoji: "💧" },
  { id: "order", type: "ORDER", label: "Ready to order", emoji: "📖" },
  // "Ready for the check" — a signal, not a payment. The server brings the
  // card machine; TabCall never handles the money.
  { id: "check", type: "BILL", label: "Ready for the check", emoji: "🧾" },
  { id: "celebrate", type: "CELEBRATION", label: "Celebrating something", emoji: "🎉" },
  // Both of these can go to a runner rather than pulling the assigned
  // server away from another table.
  { id: "clean", type: "CLEAN", label: "Clear the table", emoji: "🧽" },
  { id: "supplies", type: "SUPPLIES", label: "Napkins / cutlery", emoji: "🍴" },
  { id: "other", type: "HELP", label: "Something else", emoji: "💬" },
];

type Status = "idle" | "sending" | "sent" | "acknowledged" | "error";

export function ServiceSheet({
  serverName,
  sessionToken,
  sessionId,
  venueSlug,
  autoOpen = false,
  showDock = true,
}: {
  /** Null when the table has no assigned server. */
  serverName: string | null;
  sessionToken: string;
  /** /api/requests authenticates on (sessionId, sessionToken). */
  sessionId: string;
  venueSlug: string;
  /** Opened by another control on the page, e.g. "Need Sarah now?". */
  autoOpen?: boolean;
  /**
   * Whether to render the docked button. False on the welcome screen,
   * which has its own "Need Sarah now?" action — two of the same control
   * on one screen, with the dock covering the other, is worse than one.
   */
  showDock?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [status, setStatus] = useState<Status>("idle");
  const [chosen, setChosen] = useState<ServiceOption | null>(null);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const who = serverName ?? "a server";
  const cta = serverName ? `Need ${serverName}?` : "Need a server?";
  const sheetTitle = serverName ? `How can ${serverName} help?` : "How can we help?";

  // Poll for a real acknowledgement. The guest is only told someone is on
  // the way once a member of staff has actually pressed "Got it".
  useEffect(() => {
    if (status !== "sent" || !requestId) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/v/${venueSlug}/requests/${requestId}?s=${encodeURIComponent(sessionToken)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body = await res.json();
        if (!alive) return;
        if (body.status === "ACKNOWLEDGED" || body.status === "RESOLVED") {
          setStatus("acknowledged");
        }
      } catch {
        /* offline — keep the last honest state */
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [status, requestId, venueSlug, sessionToken]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(option: ServiceOption) {
    setChosen(option);
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          type: option.type,
          note: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setRequestId(body?.id ?? null);
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Couldn't send that");
    }
  }

  function reset() {
    setOpen(false);
    // Let the closing animation finish before wiping the panel.
    setTimeout(() => {
      setStatus("idle");
      setChosen(null);
      setNote("");
      setRequestId(null);
      setError(null);
    }, 200);
  }

  return (
    <>
      {/* Docked, thumb-height, clear of the iOS home indicator. */}
      {showDock ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="pointer-events-auto flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-slate text-[16px] font-semibold text-oat shadow-lift transition-transform active:scale-[0.99]"
          >
            <span aria-hidden>🔔</span>
            {cta}
          </button>
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate/40 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) reset();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={sheetTitle}
            className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card motion-safe:animate-[slideUp_220ms_cubic-bezier(0.16,1,0.3,1)]"
          >
            <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate/15" />

            {status === "sent" || status === "acknowledged" ? (
              <Confirmation
                who={who}
                acknowledged={status === "acknowledged"}
                label={chosen?.label ?? ""}
                onClose={reset}
              />
            ) : (
              <>
                <h2 className="text-[20px] font-semibold tracking-tight text-slate">
                  {sheetTitle}
                </h2>

                <ul className="mt-4 space-y-2">
                  {SERVICE_OPTIONS.map(option => (
                    <li key={option.id}>
                      <button
                        type="button"
                        disabled={status === "sending"}
                        onClick={() => void send(option)}
                        className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-umber-soft/40 bg-white px-4 text-left text-[15px] text-slate transition-colors hover:bg-oat active:bg-oat disabled:opacity-60"
                      >
                        <span aria-hidden className="text-lg">{option.emoji}</span>
                        <span className="flex-1">{option.label}</span>
                        {status === "sending" && chosen?.id === option.id ? (
                          <span className="text-[12px] text-slate/50">Sending…</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>

                <label className="mt-4 block">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-umber">
                    Anything to add?
                  </span>
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    maxLength={200}
                    placeholder="Optional"
                    className="mt-1.5 min-h-[48px] w-full rounded-xl border border-umber-soft/40 bg-white px-3.5 text-[15px] text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-2 focus:ring-sea/30"
                  />
                </label>

                {error ? (
                  <p role="alert" className="mt-3 rounded-xl bg-coral/10 px-3 py-2 text-[13px] text-coral">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={reset}
                  className="mt-4 min-h-[44px] w-full text-[14px] text-slate/55"
                >
                  Not right now
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(12%); opacity: 0.6; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
    </>
  );
}

/**
 * Two distinct states, and the difference is the honest bit:
 *   notified    → "{who} has been notified."
 *   acknowledged→ "{who} is on the way."
 */
function Confirmation({
  who,
  acknowledged,
  label,
  onClose,
}: {
  who: string;
  acknowledged: boolean;
  label: string;
  onClose: () => void;
}) {
  return (
    <div role="status" aria-live="polite" className="py-2 text-center">
      <span
        aria-hidden
        className={[
          "mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl transition-colors",
          acknowledged ? "bg-chartreuse" : "bg-sea-soft",
        ].join(" ")}
      >
        {acknowledged ? "🚶" : "✓"}
      </span>

      <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-slate">
        {acknowledged ? `${cap(who)} is on the way.` : `${cap(who)} has been notified.`}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-slate/65">
        {acknowledged
          ? "They've seen it and they're heading over."
          : `We've passed on "${label}". You'll see it here the moment they pick it up.`}
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 min-h-[48px] w-full rounded-2xl bg-slate text-[15px] font-semibold text-oat"
      >
        Back to the menu
      </button>
    </div>
  );
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
