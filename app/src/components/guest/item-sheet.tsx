"use client";

import { useEffect } from "react";

/**
 * One dish, opened.
 *
 * The menu list truncates a description to two lines and shows a 44px
 * thumbnail, which is the right density for scanning and the wrong one for
 * deciding. Tapping a row previously did nothing at all — the only
 * interactive thing was a small unlabelled star — so a guest who wanted to
 * know what was in something had no way to find out.
 *
 * A sheet rather than a page: the guest is part-way down a list they want
 * to come back to, and a navigation loses their place.
 */

export type SheetItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  tags: string[];
};

export function ItemSheet({
  item,
  saved,
  canSave,
  onToggleSave,
  onClose,
}: {
  item: SheetItem;
  saved: boolean;
  canSave: boolean;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // The list behind must not scroll while the sheet is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate/40 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-oat pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card motion-safe:animate-[sheetUp_240ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-52 w-full object-cover" />
        ) : (
          <div aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-slate/15" />
        )}

        <div className="px-5 pt-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-slate">
              {item.name}
            </h2>
            <span className="shrink-0 font-mono text-[16px] tabular-nums text-slate">
              ${(item.priceCents / 100).toFixed(2)}
            </span>
          </div>

          {/* The whole point: the description in full, not clipped. */}
          {item.description ? (
            <p className="mt-3 text-[15px] leading-relaxed text-slate/75">{item.description}</p>
          ) : null}

          {item.tags.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {item.tags.map(tag => (
                <li
                  key={tag}
                  className="rounded-full bg-white px-3 py-1 text-[12px] text-slate/65 ring-1 ring-umber-soft/30"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          {canSave ? (
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved}
              className={[
                "mt-6 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold transition-colors",
                saved ? "bg-chartreuse text-slate" : "bg-slate text-oat",
              ].join(" ")}
            >
              <span aria-hidden>{saved ? "★" : "☆"}</span>
              {saved ? "Saved to My Picks" : "Save to My Picks"}
            </button>
          ) : null}

          <p className="mt-2 text-center text-[12px] leading-relaxed text-slate/45">
            A shortlist to show your server. It doesn&rsquo;t place an order.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 min-h-[44px] w-full text-[14px] text-slate/55"
          >
            Close
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes sheetUp {
          from { transform: translateY(14%); opacity: 0.7; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
