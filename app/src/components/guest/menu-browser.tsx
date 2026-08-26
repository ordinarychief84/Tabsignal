"use client";

import { useEffect, useRef } from "react";

/**
 * "Browse menu" — the way into a menu with fifty items on it.
 *
 * The horizontal chip strip this replaces works for four categories and
 * collapses at eleven: the last six live off-screen behind a scroll
 * nobody discovers, so a guest looking for the wine list scrolls the
 * whole cocktail section instead and puts the phone down.
 *
 * A full-height sheet fixes that by showing everything at once, with
 * COUNTS — "Single Liquor 52" tells a guest what they're walking into
 * before they commit a tap, which a chip cannot.
 *
 * Groups are bold headings, categories sit under them. A group with
 * nothing under it is a row in its own right, so a venue that never sets
 * groups gets a plain list rather than a hierarchy with one empty level.
 */

export type BrowseGroup = {
  /** Null for categories with no heading above them. */
  name: string | null;
  categories: { id: string; name: string; count: number }[];
};

export function MenuBrowser({
  groups,
  currentId,
  onPick,
  onClose,
}: {
  groups: BrowseGroup[];
  /** The section the guest is looking at, highlighted in the list. */
  currentId: string | null;
  onPick: (categoryId: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    // A sheet this tall over a scrolling list means two scroll contexts
    // fighting; lock the one behind it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="Browse menu"
    >
      <header className="flex items-center justify-between gap-3 border-b border-sandstone px-4 py-3">
        {/* Balanced spacer so the title sits centred without absolute
            positioning, which drifts once a long venue name wraps. */}
        <span className="w-16" aria-hidden />
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-graphite">
          Browse menu
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-16 items-center justify-end text-[22px] leading-none text-graphite hover:text-plum"
        >
          ✕
        </button>
      </header>

      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 outline-none"
      >
        {groups.map((group, gi) => (
          <section key={group.name ?? `ungrouped-${gi}`} className="mb-4">
            {group.name ? (
              <h3 className="px-1 pb-1 pt-3 text-[15px] font-semibold text-plum">
                {group.name}
              </h3>
            ) : null}
            <ul>
              {group.categories.map(c => {
                const current = c.id === currentId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onPick(c.id)}
                      aria-current={current ? "true" : undefined}
                      className={[
                        "flex min-h-[48px] w-full items-center justify-between gap-4 rounded-lg px-3 text-left transition-colors",
                        current
                          ? "bg-saffron-soft font-semibold text-plum"
                          : "text-graphite hover:bg-surface-hover",
                      ].join(" ")}
                    >
                      <span className="min-w-0 truncate text-[15px]">{c.name}</span>
                      {/* The count is the point. "52" sets an expectation a
                          chip label never could. */}
                      <span className="shrink-0 font-mono text-[13px] tabular-nums text-graphite">
                        {c.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
