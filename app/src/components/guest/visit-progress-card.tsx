"use client";

import type { VisitProgress } from "@/lib/visit-progress";

/**
 * "Two visits in. One more and Luna buys you a dessert."
 *
 * The quiet version of what the mockup drew as a points economy. What a
 * guest sees is a count of visits — a fact — and the reward in the
 * venue's own words. There is no balance, no tier, no currency and no
 * number TabCall made up, because TabCall can't see a bill and has no
 * business inventing what a restaurant will give away.
 *
 * Shown only to a guest who chose to identify themselves, and only when
 * the venue both switched the scheme on AND wrote down what the reward
 * is. A progress bar leading to an unwritten reward is worse than no bar
 * at all: it implies a promise nobody made.
 */

export function VisitProgressCard({
  progress,
  venueName,
  hint,
  accent,
}: {
  progress: VisitProgress;
  venueName: string;
  /** Copy from lib/visit-progress — never composed here. */
  hint: string;
  accent: string;
}) {
  const { visits, required, earned, rewardLabel, programName, fraction } = progress;

  return (
    <section
      className={[
        "mb-6 overflow-hidden rounded-2xl border p-4",
        earned ? "border-mint-deep/30 bg-mint" : "border-sandstone bg-surface",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
          {programName || `${venueName} regulars`}
        </p>
        {/* The count, plainly. Not a score — there is nothing to beat. */}
        <p className="shrink-0 font-mono text-[12px] tabular-nums text-graphite">
          {Math.min(visits, required)} / {required} visits
        </p>
      </div>

      <p className="mt-2 text-[16px] font-semibold leading-tight text-plum">{rewardLabel}</p>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-sandstone"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={Math.min(visits, required)}
        aria-label={`${Math.min(visits, required)} of ${required} visits`}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.round(fraction * 100)}%`, background: accent }}
        />
      </div>

      <p className="mt-2.5 text-[13px] leading-relaxed text-graphite">{hint}</p>
    </section>
  );
}
