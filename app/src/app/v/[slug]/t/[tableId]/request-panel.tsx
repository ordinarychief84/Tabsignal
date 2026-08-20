"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { configureSocketAuth, getSocket, joinRoom, resetSocket } from "@/lib/socket";

/**
 * The beacon. Guests pick one of four signals, then press-and-hold the
 * beacon to send it — the ring fills over ~0.7s, haptics tick at the
 * milestones, and release-too-early nudges them to hold. After the send,
 * the panel becomes a live status timeline: Sent → Seen, driven by the
 * same socket ack the staff queue emits, with the acknowledging staff
 * member's name and a running elapsed clock.
 *
 * Why hold-to-send: a tap can be a pocket-brush or a toddler; a hold is
 * intent. It also gives the interaction physicality — guests describe it
 * as "flare gun, not form submit".
 */

/**
 * Each signal owns a colour. This is information, not decoration: the
 * whole screen — chip, beacon glow, progress ring, status card — retunes
 * to the armed signal, so a guest can tell what they're about to send
 * from across the table without reading a word. The venue's own --brand
 * still owns the page's ambient glow, so branding survives the shift.
 */
const REQUEST_TYPES = [
  { id: "DRINK",  label: "Another round", icon: "🍸", verb: "Calling the bar", accent: "#F5B23C" },
  { id: "REFILL", label: "Refill",        icon: "🥤", verb: "Water inbound",   accent: "#49C5E8" },
  { id: "HELP",   label: "Question",      icon: "✋", verb: "Flagging staff",  accent: "#B18CFF" },
  { id: "BILL",   label: "The bill",      icon: "🧾", verb: "Closing out",     accent: "#57D49B" },
] as const;

type RequestType = (typeof REQUEST_TYPES)[number]["id"];
type Phase = "pick" | "sent" | "ack";

/** Free-text note to the server. Capped to match the API's own limit. */
const NOTE_MAX = 120;

type PrevTab = { itemCount: number; lastRequestMinAgo: number | null };

const HOLD_MS = 700;

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch { /* iOS Safari — no-op */ }
}

export function GuestRequestPanel({
  sessionId,
  sessionToken,
  slug,
  tableLabel,
  prevTab = null,
  confirmationMessage = null,
}: {
  sessionId: string;
  sessionToken: string;
  slug: string;
  tableLabel: string;
  prevTab?: PrevTab | null;
  confirmationMessage?: string | null;
}) {
  const [selected, setSelected] = useState<RequestType>("DRINK");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [rippleKey, setRippleKey] = useState(0);
  const [servedOnce, setServedOnce] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdHint, setHoldHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sentType, setSentType] = useState<RequestType | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [ackedBy, setAckedBy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [prev, setPrev] = useState<PrevTab | null>(prevTab);
  const [closingTab, setClosingTab] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState<{ name: string | null; visits: number } | null>(null);
  const [kbArmed, setKbArmed] = useState(false);

  const lastRequestId = useRef<string | null>(null);
  const holdRaf = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = useRef<number | null>(null);
  const firedForHold = useRef(false);

  /* ------------------------- returning regular ------------------------ */
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
          setTimeout(() => { if (!cancelled) setWelcomeBack(null); }, 6_000);
        }
      } catch { /* not identified / not Pro — fine */ }
    })();
    return () => { cancelled = true; };
  }, [sessionId, sessionToken]);

  /* --------------------------- socket: acks --------------------------- */
  useEffect(() => {
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
    function onAck(payload: { request?: { id: string; acknowledgedBy?: { name?: string } | null } } | null) {
      const req = payload?.request;
      if (!req?.id) return;
      if (lastRequestId.current && req.id !== lastRequestId.current) return;
      setAckedBy(req.acknowledgedBy?.name ?? null);
      setPhase("ack");
      // Someone has now actually served this table, which is the moment a
      // review request stops being premature. Sticky for the session.
      setServedOnce(true);
      vibrate([12, 60, 12]);
    }
    socket.on("request_acknowledged", onAck);
    return () => {
      socket.off("request_acknowledged", onAck);
      leave();
      resetSocket();
    };
  }, [sessionId, sessionToken]);

  /* ------------------------- elapsed-time tick ------------------------ */
  useEffect(() => {
    if (sentAt === null) return;
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - sentAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [sentAt]);

  /* ------------------------------ submit ------------------------------ */
  const submit = useCallback(async (type: RequestType) => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setRateLimited(false);
    const trimmedNote = note.trim().slice(0, NOTE_MAX);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          type,
          // Trimmed and length-capped here as well as server-side: the
          // API rejects >120 with a flat INVALID_BODY, which would read
          // to the guest as "the app broke" rather than "too long".
          note: trimmedNote || undefined,
        }),
      });
      if (res.status === 429) {
        setRateLimited(true);
        setErrorMsg("One signal at a time — give it 30 seconds.");
        vibrate([50, 40, 50]);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(humanError(body?.error) ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      lastRequestId.current = body?.id ?? null;
      setSentType(type);
      setSentNote(trimmedNote || null);
      setNote("");
      setNoteOpen(false);
      setSentAt(Date.now());
      setElapsedSec(0);
      setAckedBy(null);
      setPhase("sent");
      setRippleKey(k => k + 1);
      vibrate([15, 40, 25]);
      if (type === "BILL") {
        // Give the beacon a beat to land, then take them to their tab.
        setTimeout(() => {
          window.location.href = `/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill?s=${encodeURIComponent(sessionToken)}`;
        }, 1200);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, sessionId, sessionToken, slug, tableLabel, note]);

  /* --------------------------- hold gesture ---------------------------
     The fire itself rides a setTimeout — authoritative even when rAF is
     throttled (low-power mode, webviews). rAF only paints the ring. */
  const cancelHold = useCallback((showHint: boolean) => {
    if (holdRaf.current !== null) cancelAnimationFrame(holdRaf.current);
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdRaf.current = null;
    holdTimer.current = null;
    holdStart.current = null;
    if (showHint && !firedForHold.current) {
      setHoldHint(true);
      setTimeout(() => setHoldHint(false), 650);
    }
    setHoldProgress(0);
  }, []);

  const beginHold = useCallback(() => {
    if (submitting || phase !== "pick") return;
    firedForHold.current = false;
    holdStart.current = performance.now();
    vibrate(8);

    // Authoritative trigger.
    holdTimer.current = setTimeout(() => {
      if (holdStart.current === null || firedForHold.current) return;
      firedForHold.current = true;
      holdStart.current = null;
      if (holdRaf.current !== null) cancelAnimationFrame(holdRaf.current);
      holdRaf.current = null;
      setHoldProgress(0);
      void submit(selected);
    }, HOLD_MS);

    // Cosmetic ring fill.
    const step = (now: number) => {
      if (holdStart.current === null) return;
      setHoldProgress(Math.min((now - holdStart.current) / HOLD_MS, 1));
      holdRaf.current = requestAnimationFrame(step);
    };
    holdRaf.current = requestAnimationFrame(step);
  }, [submitting, phase, selected, submit]);

  const endHold = useCallback(() => {
    const wasHolding = holdStart.current !== null && !firedForHold.current;
    cancelHold(wasHolding);
  }, [cancelHold]);

  useEffect(() => () => cancelHold(false), [cancelHold]);

  /* Keyboard / AT path: two presses. First arms, second sends. */
  function onBeaconKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (phase !== "pick" || submitting) return;
    if (!kbArmed) {
      setKbArmed(true);
      setTimeout(() => setKbArmed(false), 4000);
    } else {
      setKbArmed(false);
      void submit(selected);
    }
  }

  /* --------------------------- start fresh ---------------------------- */
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
      window.location.reload();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't reset the tab.");
      setClosingTab(false);
    }
  }

  function resetToPick() {
    lastRequestId.current = null;
    setPhase("pick");
    setSentType(null);
    setSentAt(null);
    setElapsedSec(0);
    setAckedBy(null);
    setErrorMsg(null);
    setRateLimited(false);
  }

  const selectedMeta = REQUEST_TYPES.find(r => r.id === selected)!;
  const sentMeta = sentType ? REQUEST_TYPES.find(r => r.id === sentType)! : null;
  const reviewHref = `/v/${slug}/t/${encodeURIComponent(tableLabel)}/feedback?s=${encodeURIComponent(sessionToken)}`;
  const noteLeft = NOTE_MAX - note.length;

  /* ============================ SENT / ACK ============================ */
  if (phase === "sent" || phase === "ack") {
    const acked = phase === "ack";
    const sentAccent = sentMeta?.accent ?? "var(--brand)";
    return (
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-6" aria-live="polite">
        <div
          className="guest-card w-full max-w-sm rounded-3xl px-7 py-8"
          style={{ borderColor: `color-mix(in srgb, ${sentAccent} 30%, transparent)` }}
        >
          {/* Beacon echo — three rings peel off on send, then a single
              bloom when staff acknowledge. */}
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            {[0, 1, 2].map(i => (
              <span
                key={`${rippleKey}-${i}`}
                aria-hidden
                className="beacon-ripple absolute inset-0 rounded-full"
                style={{
                  border: `2px solid color-mix(in srgb, ${sentAccent} 60%, transparent)`,
                  animationDelay: `${i * 0.22}s`,
                }}
              />
            ))}
            <span
              aria-hidden
              className={["absolute inset-0 rounded-full", acked ? "ack-bloom" : ""].join(" ")}
              style={{ background: `color-mix(in srgb, ${sentAccent} 18%, transparent)` }}
            />
            <span
              aria-hidden
              className="relative flex h-16 w-16 items-center justify-center rounded-full text-3xl"
              style={{ background: `color-mix(in srgb, ${sentAccent} 30%, rgba(255,255,255,0.06))` }}
            >
              {acked ? "✓" : sentMeta?.icon}
            </span>
          </div>

          {/* Status timeline */}
          <ol className="mt-7 space-y-0">
            <TimelineNode
              done
              accent={sentAccent}
              label={confirmationMessage ?? `Signal sent — ${sentMeta?.verb.toLowerCase() ?? "on its way"}`}
              sub={`${tableLabel} · ${sentMeta?.label ?? ""}`}
            />
            <TimelineConnector active={acked} accent={sentAccent} />
            <TimelineNode
              done={acked}
              accent={sentAccent}
              label={
                acked
                  ? ackedBy
                    ? `${ackedBy} saw it — on the way`
                    : "Seen — staff on the way"
                  : "Waiting for eyes…"
              }
              sub={
                acked
                  ? "Sit tight, you're up next."
                  : `${formatElapsed(elapsedSec)} · most signals get seen in under a minute`
              }
              pending={!acked}
            />
          </ol>

          {sentNote ? (
            <p className="mt-5 rounded-2xl bg-white/[0.05] px-4 py-3 text-[13px] leading-relaxed text-white/70">
              <span aria-hidden className="mr-1.5">💬</span>
              &ldquo;{sentNote}&rdquo;
            </p>
          ) : null}

          {sentType === "BILL" ? (
            <p className="mt-6 text-center text-[12px] text-white/50">
              Taking you to your tab…
            </p>
          ) : (
            <div className="mt-7 flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={resetToPick}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-[#0b0a12] transition-transform active:scale-95"
                style={{ background: sentAccent }}
              >
                Send another signal
              </button>
              {/* Only once someone has actually shown up — asking for a
                  rating while the guest is still waiting is how you earn
                  a one-star for the wait itself. */}
              {acked ? (
                <Link
                  href={reviewHref}
                  className="guest-card rounded-full px-5 py-2 text-[13px] font-medium text-white/90 transition-colors hover:bg-white/10"
                >
                  ⭐ Rate your service
                </Link>
              ) : null}
              <Link
                href={`/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill?s=${encodeURIComponent(sessionToken)}`}
                className="text-[13px] text-white/50 underline-offset-4 hover:text-white/85 hover:underline"
              >
                View running tab →
              </Link>
            </div>
          )}
        </div>
      </section>
    );
  }

  /* =============================== PICK =============================== */
  return (
    <section className="flex flex-1 flex-col px-6 pt-3">
      {welcomeBack ? (
        <div className="guest-card mb-3 rounded-2xl px-5 py-3" role="status">
          <p className="text-sm text-white/85">
            Welcome back{welcomeBack.name ? `, ${welcomeBack.name}` : ""}.{" "}
            <span className="text-white/50">
              Visit #{welcomeBack.visits + 1} — your bartender already knows.
            </span>
          </p>
        </div>
      ) : null}

      {prev ? (
        <div className="guest-card mb-3 rounded-2xl px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
            A tab from earlier is still open
          </p>
          <p className="mt-1 text-sm text-white/70">
            {prev.itemCount} item{prev.itemCount === 1 ? "" : "s"}
            {prev.lastRequestMinAgo !== null ? ` · last activity ${prev.lastRequestMinAgo}m ago` : ""}.
            Continue it, or start your own — old items stay with the previous guest.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPrev(null)}
              className="guest-card rounded-lg px-3.5 py-1.5 text-sm font-medium text-white hover:bg-white/10"
            >
              Continue this tab
            </button>
            <button
              type="button"
              onClick={startFresh}
              disabled={closingTab}
              className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#0b0a12] disabled:opacity-60"
              style={{ background: "var(--brand)" }}
            >
              {closingTab ? "Resetting…" : "Start fresh"}
            </button>
          </div>
        </div>
      ) : null}

      <SpecialsStrip slug={slug} />

      {/* Signal picker */}
      <div role="radiogroup" aria-label="What do you need?" className="mt-1 grid grid-cols-4 gap-2">
        {REQUEST_TYPES.map(rt => {
          const active = selected === rt.id;
          return (
            <button
              key={rt.id}
              role="radio"
              aria-checked={active}
              aria-label={rt.label}
              type="button"
              onClick={() => { setSelected(rt.id); vibrate(6); }}
              className={[
                "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3.5 transition-all duration-200",
                active
                  ? "guest-card scale-[1.06] chip-pop"
                  : "border border-transparent opacity-50 hover:opacity-85 hover:scale-[1.02]",
              ].join(" ")}
              style={
                active
                  ? {
                      borderColor: `color-mix(in srgb, ${rt.accent} 55%, transparent)`,
                      background: `color-mix(in srgb, ${rt.accent} 13%, rgba(255,255,255,0.045))`,
                      boxShadow: `0 0 26px color-mix(in srgb, ${rt.accent} 30%, transparent)`,
                    }
                  : undefined
              }
            >
              <span aria-hidden className="text-2xl leading-none">{rt.icon}</span>
              <span
                className="text-[11px] font-medium leading-tight"
                style={{ color: active ? rt.accent : "rgba(255,255,255,0.85)" }}
              >
                {rt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Message the server — rides along with the signal rather than
          being its own send, so staff get one queue item with context
          attached instead of a bare "Question" they have to walk over to
          decode. The API has always accepted `note`; only the guest had
          no way to write one. */}
      <div className="mt-3">
        {noteOpen ? (
          <div
            className="guest-card rounded-2xl p-3"
            style={{ borderColor: `color-mix(in srgb, ${selectedMeta.accent} 35%, transparent)` }}
          >
            <label htmlFor="signal-note" className="sr-only">
              Add a message for your server
            </label>
            <textarea
              id="signal-note"
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              rows={2}
              placeholder={notePlaceholder(selected)}
              className="w-full resize-none bg-transparent text-[15px] leading-snug text-white placeholder-white/35 outline-none"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setNote(""); setNoteOpen(false); }}
                className="text-[12px] text-white/45 underline-offset-4 hover:text-white/80 hover:underline"
              >
                Cancel
              </button>
              <span
                className={[
                  "font-mono text-[11px] tabular-nums",
                  noteLeft <= 20 ? "text-white/70" : "text-white/30",
                ].join(" ")}
              >
                {noteLeft}
              </span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            aria-label="Add a message for your server"
            className="guest-card flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/[0.08]"
          >
            <span aria-hidden className="text-base">💬</span>
            <span className="text-[13px] text-white/55">
              Add a message for your server
              <span className="text-white/30"> · optional</span>
            </span>
          </button>
        )}
        {note.trim() ? (
          <p className="mt-1.5 px-1 text-[11px] text-white/40">
            Sends with your {selectedMeta.label.toLowerCase()} signal.
          </p>
        ) : null}
      </div>

      {/* The beacon */}
      <div className="relative mx-auto mt-8 mb-2 flex flex-col items-center">
        <div className="relative flex h-52 w-52 items-center justify-center">
          {/* breathing glow, tuned to the armed signal and brightening as
              the hold charges — the screen visibly "powers up" under the
              thumb rather than just filling a bar. */}
          <span
            aria-hidden
            className="beacon-breathe absolute inset-4 rounded-full"
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, ${selectedMeta.accent} ${34 + holdProgress * 46}%, transparent) 0%, transparent 70%)`,
              transform: `scale(${1 + holdProgress * 0.12})`,
            }}
          />
          {/* progress ring */}
          <svg aria-hidden viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
            <circle
              cx="100" cy="100" r="88" fill="none"
              stroke={selectedMeta.accent} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 88}
              strokeDashoffset={(1 - holdProgress) * 2 * Math.PI * 88}
              style={{
                transition: holdProgress === 0 ? "stroke-dashoffset 0.25s ease-out" : "none",
                filter: holdProgress > 0 ? `drop-shadow(0 0 6px ${selectedMeta.accent})` : undefined,
              }}
            />
          </svg>
          <button
            type="button"
            onPointerDown={e => { e.preventDefault(); beginHold(); }}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onContextMenu={e => e.preventDefault()}
            onKeyDown={onBeaconKey}
            disabled={submitting}
            aria-label={`Hold to send: ${selectedMeta.label}`}
            className={[
              "guest-card relative flex h-40 w-40 select-none flex-col items-center justify-center rounded-full",
              "touch-none transition-transform duration-150 active:scale-95 disabled:opacity-60",
              holdHint ? "hold-hint" : "",
            ].join(" ")}
            style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
          >
            <span aria-hidden className="text-4xl">{selectedMeta.icon}</span>
            <span className="mt-2 text-[13px] font-semibold tracking-wide" style={{ color: selectedMeta.accent }}>
              {submitting ? "Sending…" : kbArmed ? "Press again to send" : holdProgress > 0 ? "Keep holding…" : "HOLD TO SEND"}
            </span>
            <span className="mt-0.5 text-[11px] text-white/45">{selectedMeta.label}</span>
          </button>
        </div>
        <p className={["mt-1 text-[12px] transition-opacity", holdHint ? "text-white/85" : "text-white/35"].join(" ")}>
          {holdHint ? "Almost — hold it down a beat longer" : "A firm press. Like ringing a bell."}
        </p>
      </div>

      {errorMsg ? (
        <p
          role="alert"
          className={[
            "mx-auto mt-3 max-w-sm rounded-xl px-4 py-2.5 text-center text-sm",
            rateLimited ? "guest-card text-white/85" : "border border-red-400/30 bg-red-500/10 text-red-200",
          ].join(" ")}
        >
          {errorMsg}
        </p>
      ) : null}

      <div className="mb-2 mt-4 flex items-center justify-center gap-4">
        <Link
          href={`/v/${slug}/t/${encodeURIComponent(tableLabel)}/bill?s=${encodeURIComponent(sessionToken)}`}
          className="text-[13px] text-white/45 underline-offset-4 transition-colors hover:text-white/85 hover:underline"
        >
          View running tab →
        </Link>
        <span aria-hidden className="text-white/15">·</span>
        <ReviewLink href={reviewHref} emphasised={servedOnce} />
      </div>
    </section>
  );
}

/* ---------------------------- subcomponents ---------------------------- */

/**
 * Placeholder copy per signal. A generic "type a message" prompt gets
 * generic messages; naming the thing the guest is most likely to want
 * gets staff something they can act on without a second trip.
 */
function notePlaceholder(type: RequestType): string {
  switch (type) {
    case "DRINK":  return "Same again, but make it a double…";
    case "REFILL": return "Still water for the table, no ice…";
    case "HELP":   return "Which of these is gluten free?";
    case "BILL":   return "Splitting three ways, card each…";
  }
}

/**
 * Review entry point. Sits quietly in the footer until staff have
 * actually acknowledged something this session, then brightens — the
 * same link either way, so a guest who wants to review early still can.
 */
function ReviewLink({ href, emphasised }: { href: string; emphasised: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "text-[13px] underline-offset-4 transition-colors hover:underline",
        emphasised ? "font-medium text-white/85 hover:text-white" : "text-white/45 hover:text-white/85",
      ].join(" ")}
    >
      <span aria-hidden className="mr-1">⭐</span>
      Rate your service
    </Link>
  );
}


function TimelineNode({ done, pending = false, label, sub, accent }: {
  done: boolean;
  pending?: boolean;
  label: string;
  sub?: string;
  accent: string;
}) {
  return (
    <li className="flex items-start gap-3.5">
      <span
        aria-hidden
        className={[
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          done ? "node-pop text-[#0b0a12]" : "border border-white/20 text-white/30",
        ].join(" ")}
        style={done ? { background: accent } : undefined}
      >
        {done ? "✓" : ""}
        {!done && pending ? <PendingDot /> : null}
      </span>
      <span className="min-w-0 pb-1">
        <span className={["block text-[15px] font-medium leading-snug", done ? "text-white" : "text-white/55"].join(" ")}>
          {label}
        </span>
        {sub ? <span className="mt-0.5 block text-[12px] text-white/45">{sub}</span> : null}
      </span>
    </li>
  );
}

function PendingDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/50 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-white/70" />
    </span>
  );
}

function TimelineConnector({ active, accent }: { active: boolean; accent: string }) {
  return (
    <li aria-hidden className="ml-[11px] h-7 w-0.5 rounded-full" style={{
      background: active
        ? `linear-gradient(to bottom, ${accent}, color-mix(in srgb, ${accent} 40%, transparent))`
        : "rgba(255,255,255,0.12)",
    }} />
  );
}

function humanError(code: unknown): string | null {
  switch (code) {
    case "SESSION_EXPIRED": return "This table session expired — re-scan the QR to start a new one.";
    case "SESSION_CLOSED":  return "This tab is closed. Re-scan the QR to open a fresh one.";
    case "SESSION_NOT_FOUND": return "We couldn't find this table session — re-scan the QR.";
    default: return null;
  }
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} elapsed` : `${s}s elapsed`;
}

/* ------------------------------ specials ------------------------------ */

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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v/${slug}/specials`, { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setSpecials(body.specials ?? []);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (!specials || specials.length === 0) return null;
  const shown = expanded ? specials : specials.slice(0, 2);

  return (
    <section className="guest-card mb-4 rounded-2xl p-4">
      <p className="text-[11px] uppercase tracking-[0.22em]" style={{ color: "var(--brand)" }}>
        Tonight
      </p>
      <ul className="mt-2 space-y-2.5">
        {shown.map(s => (
          <li key={s.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-white">{s.title}</p>
              {s.priceCents !== null ? (
                <p className="shrink-0 font-mono text-sm text-white/85">
                  ${(s.priceCents / 100).toFixed(2)}
                </p>
              ) : null}
            </div>
            {s.description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-white/55">{s.description}</p>
            ) : null}
            {s.endsAt ? (
              <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
                Ends {new Date(s.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {specials.length > 2 ? (
        <button
          type="button"
          onClick={() => setExpanded(x => !x)}
          className="mt-2 text-[12px] text-white/50 underline-offset-4 hover:text-white/85 hover:underline"
        >
          {expanded ? "Show less" : `+${specials.length - 2} more`}
        </button>
      ) : null}
    </section>
  );
}
