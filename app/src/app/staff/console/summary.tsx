"use client";

import type { ShiftSummary } from "@/lib/waiter-console";
import { formatWait } from "@/lib/wait-format";

/**
 * The four numbers above the queue.
 *
 * Kept deliberately small. A waiter's screen has one job — show who is
 * waiting — and metrics that grow to fill the top third of it are
 * competing with the thing the product exists to do. These are a glance,
 * not a dashboard: one line each, no charts, no sparklines, no deltas
 * against yesterday that nobody can act on mid-service.
 *
 * Every number is real or absent. A missing median shows an em dash
 * rather than a zero, because "0:00 response time" reads as perfect
 * service when it actually means nothing has happened yet.
 */

export function OperationalSummary({ summary }: { summary: ShiftSummary }) {
  return (
    <section aria-label="Your shift so far" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Metric
        label="Active"
        value={String(summary.activeRequests)}
        hint={summary.newRequests > 0 ? `${summary.newRequests} new` : "at your tables"}
        tone={summary.newRequests > 0 ? "attention" : "plain"}
      />
      <Metric
        label="Response"
        value={summary.responseSeconds === null ? "—" : formatWait(summary.responseSeconds)}
        hint="typical, this shift"
      />
      <Metric
        label="Completed"
        value={String(summary.completedThisShift)}
        hint="this shift"
      />
      <Metric
        label="Guest rating"
        value={summary.rating === null ? "—" : summary.rating.toFixed(1)}
        // The denominator matters: 5.0 from one guest is not 5.0 from
        // forty, and a server reading the first as the second will draw
        // the wrong conclusion about their night.
        hint={
          summary.ratingCount === 0
            ? "none this shift"
            : summary.ratingCount === 1
              ? "from 1 guest"
              : `from ${summary.ratingCount} guests`
        }
      />
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "plain" | "attention";
}) {
  return (
    <div
      className={[
        "rounded-xl border px-3 py-2.5",
        tone === "attention"
          ? "border-saffron-deep/30 bg-saffron-soft"
          : "border-sandstone bg-surface",
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-graphite">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[22px] font-semibold leading-none tabular-nums text-plum">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-graphite">{hint}</p>
    </div>
  );
}
