"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import type { GuestEventType } from "@/lib/guest-events";

/**
 * Analytics from a phone on restaurant wifi.
 *
 * Every design choice here is about that sentence. A guest is on a
 * congested access point behind a wall, and the product's job is to let
 * them read a menu and call a server. Analytics get whatever is left
 * over, and never take priority:
 *
 *   - events QUEUE and flush on a timer, not one request per tap
 *   - the flush uses sendBeacon where it exists, so leaving the page
 *     doesn't cancel the last batch mid-flight
 *   - a failed flush is dropped, not retried — a queue that grows while
 *     offline eventually sends a burst of stale events, and none of this
 *     is worth a second request
 *   - nothing here can throw into a render; every call site is fire and
 *     forget
 *
 * The queue holds only what the server will store anyway: a verb and, at
 * most, which dish or promotion it was about. No names, no numbers, no
 * device information — there is nowhere in the schema to put them and
 * nowhere in this file that reads them.
 */

type Queued = {
  type: GuestEventType;
  menuItemId?: string | null;
  promotionId?: string | null;
};

type Tracker = (
  type: GuestEventType,
  about?: { menuItemId?: string | null; promotionId?: string | null },
) => void;

const noop: Tracker = () => {};
const TrackContext = createContext<Tracker>(noop);

/** Long enough to batch a burst of taps, short enough to survive a close. */
const FLUSH_MS = 8_000;
const MAX_QUEUE = 20;

export function TrackProvider({
  venueSlug,
  sessionId,
  sessionToken,
  children,
}: {
  venueSlug: string;
  sessionId: string;
  sessionToken: string;
  children: React.ReactNode;
}) {
  const queue = useRef<Queued[]>([]);
  const endpoint = `/api/v/${venueSlug}/events`;

  const flush = useCallback(
    (useBeacon: boolean) => {
      if (queue.current.length === 0) return;
      const events = queue.current;
      queue.current = [];
      const payload = JSON.stringify({ sessionId, sessionToken, events });

      try {
        if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
          // Survives the page going away, which is exactly when the most
          // interesting event of a visit tends to fire.
          navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
          return;
        }
        void fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        /* dropped on purpose — see the note above */
      }
    },
    [endpoint, sessionId, sessionToken],
  );

  const track = useCallback<Tracker>((type, about) => {
    queue.current.push({
      type,
      menuItemId: about?.menuItemId ?? null,
      promotionId: about?.promotionId ?? null,
    });
    // A guest who taps a lot shouldn't build an unbounded queue.
    if (queue.current.length >= MAX_QUEUE) {
      queue.current = queue.current.slice(-MAX_QUEUE);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => flush(false), FLUSH_MS);

    // visibilitychange rather than unload: on iOS Safari a page is very
    // often frozen and never unloaded, so unload is the one handler that
    // reliably doesn't run.
    function onHide() {
      if (document.visibilityState === "hidden") flush(true);
    }
    document.addEventListener("visibilitychange", onHide);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      flush(true);
    };
  }, [flush]);

  return <TrackContext.Provider value={track}>{children}</TrackContext.Provider>;
}

/**
 * Raise an event. Safe to call anywhere, including outside a provider —
 * it becomes a no-op rather than throwing, so a component can be reused
 * on a page that doesn't track without a guard at every call site.
 */
export function useTrack(): Tracker {
  return useContext(TrackContext);
}

/** Fire one event once, on mount. The common case for "X was viewed". */
export function useTrackOnce(
  type: GuestEventType,
  about?: { menuItemId?: string | null; promotionId?: string | null },
) {
  const track = useTrack();
  const fired = useRef(false);
  const aboutRef = useRef(about);
  aboutRef.current = about;

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(type, aboutRef.current);
  }, [track, type]);
}
