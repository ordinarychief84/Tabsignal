"use client";

import { useEffect, useState } from "react";
import { playRequestChime, setSoundEnabled, soundEnabled } from "@/lib/staff/alert";

/**
 * Request sound, on or off.
 *
 * Per device rather than per account, deliberately: the same person's
 * own phone and the shared tablet by the pass want different answers,
 * and a setting stored against the staff account would force one on
 * both.
 *
 * TURNING IT ON PLAYS THE SOUND IMMEDIATELY. Two reasons. A server needs
 * to know what they have just signed up for before a busy service, not
 * discover it mid-rush. And browsers refuse to make noise until the page
 * has had a user gesture — so the tap that enables it is also the tap
 * that unlocks the audio context, which means the first real request
 * actually makes a sound instead of silently failing.
 *
 * Reads from localStorage after mount rather than during render: the
 * server has no localStorage, and initialising state from it directly
 * would hydrate with the wrong value and flip on first paint.
 */
export function SoundToggle() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOn(soundEnabled());
    setReady(true);
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
    // The gesture that unlocks audio, and the preview. See above.
    if (next) playRequestChime();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ready ? on : false}
      onClick={toggle}
      className={[
        "flex min-h-[52px] items-center justify-between gap-3 rounded-xl border px-3.5 text-left transition-colors",
        on
          ? "border-mint-deep/30 bg-mint text-mint-deep"
          : "border-sandstone bg-surface-muted text-graphite hover:bg-surface-hover",
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-plum">Request sound</span>
        {/* The state in words, not only in the switch's position — this
            is read at a glance in a dim room. */}
        <span className="block text-[11px] leading-tight">
          {on ? "On for this device" : "Off — buzz only"}
        </span>
      </span>

      <span
        aria-hidden
        className={[
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          on ? "bg-mint-deep" : "bg-graphite/25",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform motion-reduce:transition-none",
            on ? "translate-x-[1.15rem]" : "translate-x-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
