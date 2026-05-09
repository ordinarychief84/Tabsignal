"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { configureSocketAuth, getSocket, joinRoom, resetSocket } from "@/lib/socket";

// Type metadata. Icons + a short caption to make the four buttons feel
// less like a form and more like physical taps. Captions are intentionally
// terse — they're for skim-readers in dim bar light.
const REQUEST_TYPES = [
  { id: "DRINK",  label: "Order a drink", icon: "🍸", caption: "I'd like another round" },
  { id: "BILL",   label: "Get the bill",  icon: "🧾", caption: "Ready to close out" },
  { id: "HELP",   label: "Need help",     icon: "✋", caption: "Question for staff" },
  { id: "REFILL", label: "Refill",        icon: "🥤", caption: "Water, ice, top-off" },
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
  // Tier 3e: shown briefly when the guest is recognized as a returning regular.
  const [welcomeBack, setWelcomeBack] = useState<{ name: string | null; visits: number } | null>(null);

  // Tier 3e: pair the session with the cookie-identified GuestProfile,
  // if any. Fire-and-forget on mount — the buzz to the bartender's PWA
  // happens server-side. We swallow non-200s (no cookie / non-Pro venue).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}/pair-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken }),
        });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        if (body.isReturning && body.preview) {
          setWelcomeBack({
            name: body.preview.displayName ?? null,
            visits: body.preview.visits ?? 0,
          });
          // Auto-fade after 6s so it doesn't crowd the request UI.
          setTimeout(() => { if (!cancelled) setWelcomeBack(null); }, 6_000);
        }
      } catch {
        /* swallow — not identified, not Pro, etc. */
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, sessionToken]);

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
        body: JSON.stringify({ sessionId, sessionToken, type }),
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
          window.location.href = `/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill?s=${encodeURIComponent(sessionToken)}`;
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
            {acknowledged ? "Staff is on the way" : "Sent. We’re alerting your server."}
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
      {welcomeBack ? (
        <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 px-5 py-3">
          <p className="text-sm text-slate">
            Welcome back{welcomeBack.name ? `, ${welcomeBack.name}` : ""}.{" "}
            <span className="text-slate/60">
              Visit #{welcomeBack.visits + 1} — your bartender knows.
            </span>
          </p>
        </div>
      ) : null}

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

      <SpecialsStrip slug={slug} />

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
                "min-h-[110px] rounded-2xl border bg-white px-4 py-4 text-left transition-all",
                "active:scale-[0.98] disabled:opacity-60",
                isActive ? "border-chartreuse ring-2 ring-chartreuse/40" : "border-slate/10 hover:border-slate/20",
              ].join(" ")}
            >
              <span aria-hidden className="text-2xl">{rt.icon}</span>
              <span className="mt-2 block text-base font-medium text-slate">{rt.label}</span>
              <span className="mt-0.5 block text-[11px] text-slate/55">{rt.caption}</span>
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

type Special = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

function SpecialsStrip({ slug }: { slug: string }) {
  const [specials, setSpecials] = useState<Special[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v/${slug}/specials`, { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setSpecials(body.specials ?? []);
      } catch {
        /* swallow */
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (!specials || specials.length === 0) return null;

  return (
    <section className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Tonight</p>
      <ul className="mt-2 space-y-2">
        {specials.map(s => (
          <li key={s.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-slate">{s.title}</p>
              {s.priceCents !== null ? (
                <p className="shrink-0 font-mono text-sm text-slate">
                  ${(s.priceCents / 100).toFixed(2)}
                </p>
              ) : null}
            </div>
            {s.description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-slate/70">{s.description}</p>
            ) : null}
            {s.endsAt ? (
              <p className="mt-1 text-[10px] uppercase tracking-wider text-umber">
                Ends {new Date(s.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
