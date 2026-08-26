/**
 * "Pairs well with" — venue-authored suggestions between menu items.
 *
 * The rule this module exists to enforce: TabCall never claims to know
 * what gets ordered together. It has no basket, no bill and no
 * transaction history, so any statement about what goes with what would
 * be invented. A chef knows which wine goes with the pork; the venue
 * writes the pairing down, and this reads it back.
 *
 * That constraint shapes the copy too. "Popular with" is a claim about
 * other guests, and a venue that ticks it is making that claim on its own
 * evidence — the phrasing here says "a favourite alongside", which is the
 * venue recommending rather than TabCall reporting a statistic it doesn't
 * have.
 */

export type PairingRelationship =
  | "PAIRS_WITH"
  | "POPULAR_WITH"
  | "COMPLETE_MEAL"
  | "RECOMMENDED_DRINK"
  | "RECOMMENDED_DESSERT";

export const PAIRING_RELATIONSHIPS: PairingRelationship[] = [
  "PAIRS_WITH",
  "POPULAR_WITH",
  "COMPLETE_MEAL",
  "RECOMMENDED_DRINK",
  "RECOMMENDED_DESSERT",
];

/**
 * What a guest reads above the suggestion.
 *
 * Deliberately plain, and deliberately not superlative. None of these
 * says "you'll love", "perfect match" or "customers who bought" — the
 * first two are promises nobody can make and the third is a claim about
 * data TabCall does not hold.
 */
const GUEST_COPY: Record<PairingRelationship, string> = {
  PAIRS_WITH: "Pairs well with",
  POPULAR_WITH: "A favourite alongside",
  COMPLETE_MEAL: "Rounds out the meal",
  RECOMMENDED_DRINK: "Good with a drink",
  RECOMMENDED_DESSERT: "Goes down well after",
};

/** How the venue's own staff see it in the editor. */
const ADMIN_COPY: Record<PairingRelationship, string> = {
  PAIRS_WITH: "Pairs well with",
  POPULAR_WITH: "Often taken alongside",
  COMPLETE_MEAL: "Completes the meal",
  RECOMMENDED_DRINK: "Suggested drink",
  RECOMMENDED_DESSERT: "Suggested dessert",
};

export function pairingLabel(relationship: PairingRelationship): string {
  return GUEST_COPY[relationship] ?? GUEST_COPY.PAIRS_WITH;
}

export function pairingAdminLabel(relationship: PairingRelationship): string {
  return ADMIN_COPY[relationship] ?? ADMIN_COPY.PAIRS_WITH;
}

export function isPairingRelationship(value: unknown): value is PairingRelationship {
  return (
    typeof value === "string" &&
    (PAIRING_RELATIONSHIPS as string[]).includes(value)
  );
}

type PairingRow = {
  suggestedId: string;
  relationship: PairingRelationship;
  sortOrder: number;
};

type Suggestible = { id: string; isActive?: boolean };

/**
 * The one suggestion to show for a set of items the guest has saved.
 *
 * Returns at most one. A guest who saves a pasta and gets four
 * suggestions has been handed a second menu, which is the opposite of
 * help; one is a recommendation, four is merchandising.
 *
 * Rules, in order:
 *   - only pairings whose target is still on the menu and active
 *   - never something the guest has already saved
 *   - never the item that triggered it
 *   - venue's own sortOrder decides between candidates, then the
 *     relationship order above, so the result is stable rather than
 *     shuffling on every render
 *
 * `null` when there is nothing genuine to say, which is the common case
 * for a venue that hasn't authored any pairings — and the callers render
 * nothing at all rather than an empty module.
 */
export function suggestionFor<T extends Suggestible>({
  savedIds,
  pairings,
  itemsById,
}: {
  /** Items the guest has shortlisted, most recent first. */
  savedIds: string[];
  /** Every pairing whose source is one of the saved items. */
  pairings: (PairingRow & { menuItemId: string })[];
  itemsById: Map<string, T>;
}): { item: T; relationship: PairingRelationship; sourceId: string } | null {
  if (savedIds.length === 0 || pairings.length === 0) return null;
  const saved = new Set(savedIds);

  // Walk the saved items newest first: the thing they just chose is the
  // thing a suggestion should hang off.
  for (const sourceId of savedIds) {
    const candidates = pairings
      .filter(p => p.menuItemId === sourceId)
      .filter(p => !saved.has(p.suggestedId))
      .filter(p => {
        const item = itemsById.get(p.suggestedId);
        return !!item && item.isActive !== false;
      })
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          PAIRING_RELATIONSHIPS.indexOf(a.relationship) -
            PAIRING_RELATIONSHIPS.indexOf(b.relationship) ||
          a.suggestedId.localeCompare(b.suggestedId),
      );

    const best = candidates[0];
    if (best) {
      return {
        item: itemsById.get(best.suggestedId)!,
        relationship: best.relationship,
        sourceId,
      };
    }
  }
  return null;
}

/**
 * Reject a pairing a venue shouldn't be able to save.
 *
 * Returns an error code, or null when the pairing is fine. Both ends must
 * belong to the venue doing the saving — otherwise an owner could point a
 * dish at an item on someone else's menu, and a guest would be shown a
 * dish their kitchen has never heard of.
 */
export function validatePairing({
  venueId,
  source,
  target,
}: {
  venueId: string;
  source: { id: string; venueId: string } | null;
  target: { id: string; venueId: string } | null;
}): "SOURCE_NOT_FOUND" | "TARGET_NOT_FOUND" | "CROSS_VENUE" | "SELF_PAIRING" | null {
  if (!source) return "SOURCE_NOT_FOUND";
  if (!target) return "TARGET_NOT_FOUND";
  if (source.venueId !== venueId || target.venueId !== venueId) return "CROSS_VENUE";
  if (source.id === target.id) return "SELF_PAIRING";
  return null;
}
