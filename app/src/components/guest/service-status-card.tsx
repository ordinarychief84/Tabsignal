"use client";

import { useEffect, useState } from "react";
import {
  requestTypeLabel,
  stageFor,
  statusDetail,
  statusHeadline,
  RESOLVED_VISIBLE_MS,
  type GuestRequestStatus,
} from "@/lib/service-status";

/**
 * "Sarah has been notified" — the card that answers the only question a
 * guest has after pressing the service button.
 *
 * It lives at the top of the guest home rather than inside the service
 * sheet, because the sheet closes and the waiting doesn't. Before this,
 * dismissing the sheet erased every sign that anything had been asked
 * for, so the honest options left to a guest were to sit and hope or to
 * press the button again — and the second one puts a duplicate row in
 * front of the same server.
 *
 * The state it shows is re-derived from the server on an interval, so it
 * is also what makes a refresh survivable: the page asks "does this
 * session have an open request" rather than remembering that it did.
 *
 * Careful about what it claims. See lib/service-status for why "notified"
 * and "on the way" are different sentences and only staff can move it
 * from the first to the second.
 */

export type ActiveRequest = {
  id: string;
  type: string;
  status: GuestRequestStatus;
  note: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

const POLL_MS = 5_000;

export function ServiceStatusCard({
  venueSlug,
  sessionId,
  sessionToken,
  serverName,
  initial,
  children,
  onStageChange,
}: {
  venueSlug: string;
  sessionId: string;
  sessionToken: string;
  serverName: string | null;
  /** Resolved server-side on page load, so the card is right on first paint. */
  initial: ActiveRequest | null;
  /** "While you wait…" content, rendered under the status while it's open. */
  children?: React.ReactNode;
  onStageChange?: (open: boolean) => void;
}) {
  const [request, setRequest] = useState<ActiveRequest | null>(initial);
  const [justResolved, setJustResolved] = useState(false);

  useEffect(() => {
    // Nothing open and nothing just finished — no reason to poll. A guest
    // browsing a menu for twenty minutes shouldn't be making a request
    // every five seconds for an answer that is always "no".
    if (!request && !justResolved) return;
    let alive = true;

    async function tick() {
      try {
        const res = await fetch(
          `/api/v/${venueSlug}/requests/active?session=${encodeURIComponent(sessionId)}&s=${encodeURIComponent(sessionToken)}`,
          { cache: "no-store" },
        );
        if (!res.ok || !alive) return;
        const body = (await res.json()) as { request: ActiveRequest | null };
        if (!alive) return;

        if (!body.request && request) {
          // It was open a moment ago and isn't now: staff resolved it.
          // Show the completion rather than blinking the card away.
          setJustResolved(true);
          setRequest(null);
          setTimeout(() => alive && setJustResolved(false), RESOLVED_VISIBLE_MS);
        } else if (body.request) {
          setRequest(body.request);
        }
      } catch {
        /* offline — hold the last honest state rather than guessing */
      }
    }

    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [request, justResolved, venueSlug, sessionId, sessionToken]);

  useEffect(() => {
    onStageChange?.(request !== null);
  }, [request, onStageChange]);

  if (!request && !justResolved) return null;

  const stage = request ? stageFor(request.status) : "done";
  const headline = statusHeadline(stage, serverName);
  const detail = statusDetail(stage, serverName);

  // Four tones for four meanings. "Seen" sits between waiting and
  // arriving: warmer than pending so the guest can tell something
  // changed, but not the mint that says somebody is crossing the room.
  const tone =
    stage === "coming"
      ? { bg: "bg-mint", border: "border-mint-deep/25", text: "text-mint-deep" }
      : stage === "done"
        ? { bg: "bg-service-completed", border: "border-mint-deep/20", text: "text-mint-deep" }
        : stage === "seen"
          ? { bg: "bg-apricot/25", border: "border-apricot-deep/25", text: "text-apricot-deep" }
          : { bg: "bg-saffron-soft", border: "border-saffron-deep/25", text: "text-saffron-deep" };

  return (
    <section
      aria-live="polite"
      className={`mb-6 overflow-hidden rounded-2xl border ${tone.border} ${tone.bg}`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Shape as well as colour: a tick and a clock read differently to
            someone who can't tell mint from saffron. */}
        {/* Shape as well as colour, and a distinct shape per meaning: a
            clock for waiting, an eye for seen, a tick for moving or
            done. Someone who can't tell saffron from apricot still reads
            three different states. */}
        <span aria-hidden className={`mt-0.5 shrink-0 ${tone.text}`}>
          {stage === "notified" ? <ClockIcon /> : stage === "seen" ? <EyeIcon /> : <CheckIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight text-plum">{headline}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-graphite">{detail}</p>
          {request ? (
            <p className="mt-2 text-[12px] text-graphite/70">
              You asked for: {requestTypeLabel(request.type)}
              {request.note ? ` · "${request.note}"` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {/* §21: waiting time becomes discovery. Below the status, never over
          it — a guest looking for "has anyone seen this yet" should not
          have to read past a cocktail to find out. */}
      {request && children ? (
        <div className="border-t border-black/5 bg-surface/70 p-4">{children}</div>
      ) : null}
    </section>
  );
}

function EyeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}
