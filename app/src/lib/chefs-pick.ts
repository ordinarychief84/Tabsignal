import "server-only";

/**
 * "Can you guess tonight's most popular dish?"
 *
 * The game only works if the answer is TRUE. A guess-the-favourite that
 * reveals an arbitrary item is a small lie told to every guest who plays
 * it, and the one thing the spec is explicit about is not inventing
 * popularity or scarcity.
 *
 * So the answer comes from what guests actually saved to My Picks at this
 * venue — real, observable, and the only popularity signal TabCall has now
 * that it doesn't see orders. Below a floor of saves the signal is noise,
 * and rather than dress noise up as a fact the round becomes the venue's
 * own featured pick, worded as a pick rather than a popularity claim.
 *
 * Both shapes are honest. Neither pretends to know more than it does.
 */

import { db } from "@/lib/db";

/** Below this many saves, "most popular" isn't a claim worth making. */
const MIN_SAVES_FOR_POPULARITY = 5;
const WINDOW_DAYS = 30;

export type ChefsPickRound = {
  /** The real answer. */
  answerId: string;
  /** Three items to choose between, answer included, in stable order. */
  choices: { id: string; name: string; imageUrl: string | null; priceCents: number }[];
  /**
   * What we can honestly say about the answer.
   *  - "popular": enough guests saved it that the claim holds
   *  - "featured": the venue's own pick; no popularity claimed
   */
  basis: "popular" | "featured";
};

type Candidate = { id: string; name: string; imageUrl: string | null; priceCents: number };

/**
 * Build a round, or null when the menu is too small for a meaningful
 * guess. Three items is the minimum for the game to be a choice rather
 * than a formality.
 */
export async function chefsPickRound(opts: {
  venueId: string;
  /** Stable per guest, so re-opening doesn't reshuffle the answer. */
  seed: string;
}): Promise<ChefsPickRound | null> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const [saves, items] = await Promise.all([
    db.wishlistItem.groupBy({
      by: ["menuItemId"],
      where: { wishlist: { venueId: opts.venueId }, createdAt: { gte: since } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.menuItem.findMany({
      where: { venueId: opts.venueId, isActive: true },
      select: { id: true, name: true, imageUrl: true, priceCents: true, isFeatured: true },
      take: 200,
    }),
  ]);

  if (items.length < 3) return null;

  const byId = new Map(items.map(i => [i.id, i]));
  const top = saves[0];
  const topCount = top?._sum.quantity ?? 0;

  let answer: Candidate | undefined;
  let basis: ChefsPickRound["basis"];

  if (top && topCount >= MIN_SAVES_FOR_POPULARITY && byId.has(top.menuItemId)) {
    answer = byId.get(top.menuItemId)!;
    basis = "popular";
  } else {
    // Not enough signal to call anything popular. Fall back to the
    // venue's own choice and say that instead.
    answer = items.find(i => i.isFeatured) ?? items[0];
    basis = "featured";
  }
  if (!answer) return null;

  // Two decoys, chosen deterministically from the seed so the round is
  // stable for a guest but differs between tables.
  const others = items.filter(i => i.id !== answer!.id);
  const offset = Math.abs(hash(opts.seed)) % Math.max(1, others.length);
  const rotated = [...others.slice(offset), ...others.slice(0, offset)];
  const decoys = rotated.slice(0, 2);
  if (decoys.length < 2) return null;

  // Place the answer at a seed-derived position so it isn't always first.
  const choices = [...decoys.map(strip), strip(answer)];
  const at = Math.abs(hash(opts.seed + "pos")) % 3;
  const [last] = choices.splice(2, 1);
  choices.splice(at, 0, last!);

  return { answerId: answer.id, choices, basis };
}

function strip(i: Candidate | (Candidate & { isFeatured: boolean })): Candidate {
  return { id: i.id, name: i.name, imageUrl: i.imageUrl, priceCents: i.priceCents };
}

/** Small, stable, non-cryptographic — this only picks an ordering. */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return h;
}
