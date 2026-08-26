/**
 * "Pairs well with" — venue-authored, never inferred.
 *
 * The rule this whole feature rests on: TabCall has no basket, no bill
 * and no transaction history, so it cannot know what actually gets
 * ordered together. Anything it claimed about that would be made up. A
 * chef knows which wine goes with the pork; the venue writes it down and
 * the product reads it back.
 *
 * So these tests care as much about the COPY as about the selection. A
 * relationship that produced "customers who bought this also bought"
 * would be a statistic the product does not have, and would be a lie in
 * front of a paying guest even though every line of code ran correctly.
 */

import { describe, expect, test } from "bun:test";
import {
  PAIRING_RELATIONSHIPS,
  isPairingRelationship,
  pairingAdminLabel,
  pairingLabel,
  suggestionFor,
  validatePairing,
  type PairingRelationship,
} from "@/lib/pairings";

type Item = { id: string; name: string; isActive?: boolean };

const ITEMS: Item[] = [
  { id: "pasta", name: "Cacio e Pepe" },
  { id: "wine", name: "Barolo" },
  { id: "dessert", name: "Tiramisu" },
  { id: "off", name: "Seasonal Special", isActive: false },
];

const byId = new Map(ITEMS.map(i => [i.id, i]));

function pairing(
  menuItemId: string,
  suggestedId: string,
  relationship: PairingRelationship = "PAIRS_WITH",
  sortOrder = 0,
) {
  return { menuItemId, suggestedId, relationship, sortOrder };
}

describe("the copy never claims a statistic", () => {
  test("no label implies data TabCall doesn't hold", () => {
    // "customers also bought", "frequently bought together" and friends
    // all describe transactions. There are none to describe.
    const banned = [
      "customers",
      "also bought",
      "bought together",
      "people who",
      "others ordered",
      "best seller",
      "trending",
    ];
    for (const r of PAIRING_RELATIONSHIPS) {
      const guest = pairingLabel(r).toLowerCase();
      const admin = pairingAdminLabel(r).toLowerCase();
      for (const phrase of banned) {
        expect(guest).not.toContain(phrase);
        expect(admin).not.toContain(phrase);
      }
    }
  });

  test("no label overpromises on the guest's behalf", () => {
    for (const r of PAIRING_RELATIONSHIPS) {
      const guest = pairingLabel(r).toLowerCase();
      expect(guest).not.toContain("you'll love");
      expect(guest).not.toContain("perfect");
      expect(guest).not.toContain("must");
    }
  });

  test("every relationship produces its own sentence", () => {
    // If two relationships read identically there's no reason for a venue
    // to be offered both, and the extra choice is noise in the editor.
    const labels = PAIRING_RELATIONSHIPS.map(pairingLabel);
    expect(new Set(labels).size).toBe(PAIRING_RELATIONSHIPS.length);
  });

  test("an unknown relationship degrades rather than rendering blank", () => {
    expect(pairingLabel("NONSENSE" as PairingRelationship)).toBe("Pairs well with");
  });
});

describe("isPairingRelationship", () => {
  test("accepts the real ones and nothing else", () => {
    for (const r of PAIRING_RELATIONSHIPS) expect(isPairingRelationship(r)).toBe(true);
    for (const bad of ["", "pairs_with", null, 3, {}, "DROP TABLE"]) {
      expect(isPairingRelationship(bad)).toBe(false);
    }
  });
});

describe("suggestionFor picks exactly one, or none", () => {
  test("returns the venue's suggestion for a saved item", () => {
    const found = suggestionFor({
      savedIds: ["pasta"],
      pairings: [pairing("pasta", "wine")],
      itemsById: byId,
    });
    expect(found?.item.id).toBe("wine");
    expect(found?.sourceId).toBe("pasta");
  });

  test("nothing saved means no suggestion", () => {
    expect(
      suggestionFor({ savedIds: [], pairings: [pairing("pasta", "wine")], itemsById: byId }),
    ).toBeNull();
  });

  test("a venue that authored nothing gets nothing", () => {
    // The common case, and it must render no module at all rather than an
    // empty one.
    expect(suggestionFor({ savedIds: ["pasta"], pairings: [], itemsById: byId })).toBeNull();
  });

  test("never suggests something already saved", () => {
    // Recommending a dish the guest shortlisted reads as not paying
    // attention.
    expect(
      suggestionFor({
        savedIds: ["pasta", "wine"],
        pairings: [pairing("pasta", "wine")],
        itemsById: byId,
      }),
    ).toBeNull();
  });

  test("never suggests something off the menu", () => {
    // 86'd items are invisible to guests everywhere else; a suggestion
    // that resurrects one sends a server to the kitchen for nothing.
    expect(
      suggestionFor({
        savedIds: ["pasta"],
        pairings: [pairing("pasta", "off")],
        itemsById: byId,
      }),
    ).toBeNull();
  });

  test("never suggests a dish that isn't on this menu at all", () => {
    expect(
      suggestionFor({
        savedIds: ["pasta"],
        pairings: [pairing("pasta", "someone-elses-dish")],
        itemsById: byId,
      }),
    ).toBeNull();
  });

  test("hangs off the newest save, not the oldest", () => {
    // savedIds arrives newest-first from the caller.
    const found = suggestionFor({
      savedIds: ["dessert", "pasta"],
      pairings: [pairing("pasta", "wine"), pairing("dessert", "off"), pairing("dessert", "wine")],
      itemsById: byId,
    });
    expect(found?.sourceId).toBe("dessert");
  });

  test("falls back to an older save when the newest has nothing to offer", () => {
    const found = suggestionFor({
      savedIds: ["dessert", "pasta"],
      pairings: [pairing("pasta", "wine")],
      itemsById: byId,
    });
    expect(found?.sourceId).toBe("pasta");
    expect(found?.item.id).toBe("wine");
  });

  test("the venue's own ordering decides between candidates", () => {
    const found = suggestionFor({
      savedIds: ["pasta"],
      pairings: [
        pairing("pasta", "dessert", "RECOMMENDED_DESSERT", 5),
        pairing("pasta", "wine", "PAIRS_WITH", 1),
      ],
      itemsById: byId,
    });
    expect(found?.item.id).toBe("wine");
  });

  test("the same inputs always give the same answer", () => {
    // A suggestion that reshuffles on every render reads as broken.
    const args = {
      savedIds: ["pasta"],
      pairings: [
        pairing("pasta", "dessert", "RECOMMENDED_DESSERT", 0),
        pairing("pasta", "wine", "PAIRS_WITH", 0),
      ],
      itemsById: byId,
    };
    const runs = Array.from({ length: 8 }, () => suggestionFor(args)?.item.id);
    expect(new Set(runs).size).toBe(1);
  });
});

describe("validatePairing keeps venues apart", () => {
  const source = { id: "a", venueId: "v1" };

  test("accepts two items from the same venue", () => {
    expect(
      validatePairing({ venueId: "v1", source, target: { id: "b", venueId: "v1" } }),
    ).toBeNull();
  });

  test("refuses a target at another venue", () => {
    // Otherwise a guest is shown a dish their kitchen has never heard of.
    expect(
      validatePairing({ venueId: "v1", source, target: { id: "b", venueId: "v2" } }),
    ).toBe("CROSS_VENUE");
  });

  test("refuses a source that isn't this venue's either", () => {
    expect(
      validatePairing({
        venueId: "v1",
        source: { id: "a", venueId: "v2" },
        target: { id: "b", venueId: "v1" },
      }),
    ).toBe("CROSS_VENUE");
  });

  test("refuses a dish paired with itself", () => {
    expect(
      validatePairing({ venueId: "v1", source, target: { id: "a", venueId: "v1" } }),
    ).toBe("SELF_PAIRING");
  });

  test("reports a missing end rather than throwing", () => {
    expect(validatePairing({ venueId: "v1", source: null, target: null })).toBe(
      "SOURCE_NOT_FOUND",
    );
    expect(validatePairing({ venueId: "v1", source, target: null })).toBe("TARGET_NOT_FOUND");
  });
});
