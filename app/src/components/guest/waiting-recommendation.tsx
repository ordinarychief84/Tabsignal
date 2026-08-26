"use client";

/**
 * "While you wait…" — one dish or drink, shown under an open request.
 *
 * The waiting is going to happen either way. The choice is whether the
 * guest spends it looking at a static "notified" line or at something the
 * venue would like them to notice, and the second is better for both
 * sides as long as it never gets in the way of the first.
 *
 * Hence the constraints this component enforces on itself:
 *
 *   - ONE item, never a carousel. A list while waiting is a distraction;
 *     a single suggestion is a suggestion.
 *   - It renders BELOW the status, never over it.
 *   - The only action is Save. Nothing here can order anything, and a
 *     guest waiting for a server should not be handed a second thing to
 *     press that looks like it might summon one.
 *   - Nothing is invented. The caller passes a real menu item chosen by
 *     deterministic rules; when there's nothing genuine to show, the
 *     caller passes null and this renders nothing at all.
 */

export type WaitingItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
};

export function WaitingRecommendation({
  item,
  reason,
  saved,
  canSave,
  onSave,
  onOpen,
}: {
  item: WaitingItem;
  /** Why this one, in the venue's own terms: "Tonight's special", etc. */
  reason: string;
  saved: boolean;
  canSave: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite/70">
        While you wait
      </p>

      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-apricot/60 to-saffron/60 text-[18px] font-semibold text-plum"
            >
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-apricot-deep">
              {reason}
            </span>
            <span className="mt-0.5 block truncate text-[15px] font-semibold text-plum">
              {item.name}
            </span>
            <span className="block text-[13px] text-graphite">
              ${(item.priceCents / 100).toFixed(2)}
            </span>
          </span>
        </button>

        {canSave ? (
          <button
            type="button"
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${item.name} from My Picks` : `Save ${item.name} for later`}
            className={[
              "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              saved
                ? "border-transparent bg-plum text-ivory"
                : "border-sandstone bg-surface text-plum hover:bg-surface-hover",
            ].join(" ")}
          >
            <span aria-hidden>{saved ? "♥" : "♡"}</span>
            {saved ? "Saved" : "Save"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
