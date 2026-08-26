"use client";

import { pairingLabel, type PairingRelationship } from "@/lib/pairings";

/**
 * "Pairs well with the Barolo."
 *
 * One suggestion, hanging off something the guest already chose. The
 * constraint that makes this tasteful rather than pushy is that it is
 * always exactly one, always attached to a decision they already made,
 * and always something a person at the venue actually wrote down.
 *
 * TabCall cannot know what gets ordered together — no basket, no bill, no
 * transaction history — so it never says "customers also bought" or
 * anything else that implies a statistic. The venue's chosen relationship
 * supplies the sentence, and the venue stands behind it.
 *
 * There is no "add" here, only "save". Nothing on the guest surface
 * orders anything; the server still takes the order.
 */

export type PairingItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
};

export function PairingSuggestion({
  item,
  relationship,
  /** The dish this hangs off — named so the suggestion has a reason. */
  sourceName,
  saved,
  canSave,
  onSave,
  onOpen,
  tint,
}: {
  item: PairingItem;
  relationship: PairingRelationship;
  sourceName: string | null;
  saved: boolean;
  canSave: boolean;
  onSave: () => void;
  onOpen: () => void;
  /** A wash in the venue's own colour, so it doesn't read as an ad. */
  tint?: string;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-sandstone"
      style={tint ? { background: tint } : undefined}
    >
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-apricot-deep">
          {pairingLabel(relationship)}
        </p>
        {sourceName ? (
          <p className="mt-0.5 text-[12px] text-graphite">
            because you saved {sourceName}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-3">
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
              <span className="block truncate text-[15px] font-semibold text-plum">
                {item.name}
              </span>
              {item.description ? (
                <span className="mt-0.5 block truncate text-[13px] text-graphite">
                  {item.description}
                </span>
              ) : null}
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
              aria-label={
                saved ? `Remove ${item.name} from My Picks` : `Save ${item.name}`
              }
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
    </section>
  );
}
