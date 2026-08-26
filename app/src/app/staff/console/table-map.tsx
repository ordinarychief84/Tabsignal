"use client";

import { useState } from "react";
import type { TableState, WaiterTable } from "@/lib/waiter-console";
import { formatWait } from "@/lib/wait-format";

/**
 * My Tables — the floor at a glance.
 *
 * A grid rather than a drawn floor plan. A real floor plan needs
 * coordinates every venue would have to place by hand, and the question
 * a server is actually asking here is "which of my tables needs
 * something", not "where is table 12" — they already know where table 12
 * is; they work there.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Every tile carries its state as a
 * word, a count and a shape as well as a hue: these get read at a glance,
 * in a dim room, sometimes by someone who cannot distinguish saffron
 * from mint. A tile that only differs by colour is a tile that doesn't
 * communicate.
 */

const TONE: Record<TableState, { box: string; dot: string; word: string }> = {
  needs_attention: {
    box: "border-clay bg-clay-soft text-clay-deep",
    dot: "bg-clay-deep",
    word: "Waiting",
  },
  new_request: {
    box: "border-saffron-deep/40 bg-saffron-soft text-saffron-deep",
    dot: "bg-saffron-deep",
    word: "New",
  },
  in_progress: {
    box: "border-mint-deep/30 bg-mint text-mint-deep",
    dot: "bg-mint-deep",
    word: "On it",
  },
  clear: {
    box: "border-sandstone bg-surface text-graphite",
    dot: "bg-graphite/30",
    word: "Clear",
  },
};

export function TableMap({
  tables,
  onOpen,
  /** Section name, when the venue groups staff by zone. */
  section,
}: {
  tables: WaiterTable[];
  onOpen: (table: WaiterTable) => void;
  section: string | null;
}) {
  const mine = tables.filter(t => t.mine);
  const rest = tables.filter(t => !t.mine);
  // Default to their own tables. A server covering the floor can widen
  // it; a server working a section should not have to scan past
  // somebody else's twenty tables to find their four.
  const [showAll, setShowAll] = useState(mine.length === 0);
  const shown = showAll ? tables : mine;

  if (tables.length === 0) {
    return (
      <section className="rounded-2xl border border-sandstone bg-surface p-4">
        <Heading section={section} />
        <p className="mt-2 text-[13px] leading-relaxed text-graphite">
          No tables set up yet. Your manager adds them from the venue&rsquo;s Tables
          page, and they&rsquo;ll appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-sandstone bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Heading section={section} />
        {rest.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            // -my-2 px-2 gives it a real hit area without changing how
            // the row looks. 18px was a target for a mouse, not a thumb.
            className="-my-2 flex min-h-[40px] shrink-0 items-center px-2 text-[12px] font-medium text-graphite underline-offset-4 hover:text-plum hover:underline"
          >
            {showAll ? "Just mine" : `All ${tables.length}`}
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-graphite">
          No tables are assigned to you right now. Tap{" "}
          <span className="font-medium text-plum">All {tables.length}</span> to see
          the floor.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shown.map(t => (
            <li key={t.id}>
              <TableTile table={t} onOpen={() => onOpen(t)} />
            </li>
          ))}
        </ul>
      )}

      {/* A key, because four colours with no legend is a puzzle. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {(["needs_attention", "new_request", "in_progress", "clear"] as TableState[]).map(s => (
          <li key={s} className="flex items-center gap-1.5 text-[11px] text-graphite">
            <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[s].dot}`} />
            {TONE[s].word}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Heading({ section }: { section: string | null }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
      {section ? `${section} · my tables` : "My tables"}
    </h2>
  );
}

function TableTile({ table, onOpen }: { table: WaiterTable; onOpen: () => void }) {
  const tone = TONE[table.state];
  const waiting = table.oldestWaitSeconds;

  return (
    <button
      type="button"
      onClick={onOpen}
      // Every state is spelled out for a screen reader rather than left
      // to the colour of the box.
      aria-label={[
        `Table ${table.label}`,
        tone.word,
        table.openRequests > 0
          ? `${table.openRequests} open ${table.openRequests === 1 ? "request" : "requests"}`
          : null,
        waiting !== null ? `waiting ${formatWait(waiting)}` : null,
      ]
        .filter(Boolean)
        .join(", ")}
      className={[
        "flex min-h-[74px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition-transform active:scale-[0.97] motion-reduce:transition-none",
        tone.box,
      ].join(" ")}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        <span className="text-[16px] font-semibold leading-none text-plum">
          {table.label}
        </span>
        {table.openRequests > 1 ? (
          <span
            aria-hidden
            className="rounded-full bg-plum px-1.5 text-[10px] font-bold leading-4 text-ivory"
          >
            {table.openRequests}
          </span>
        ) : null}
      </span>

      {/* The state, in words. Not decoration — this is what makes the
          tile readable without colour. */}
      <span className="text-[10px] font-medium uppercase tracking-wider">{tone.word}</span>

      {waiting !== null ? (
        <span className="font-mono text-[11px] tabular-nums">{formatWait(waiting)}</span>
      ) : table.pickCount > 0 ? (
        <span className="text-[10px]">♡ {table.pickCount}</span>
      ) : table.occupied ? (
        <span className="text-[10px] opacity-70">seated</span>
      ) : null}
    </button>
  );
}
