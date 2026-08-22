/**
 * "Guess tonight's most popular dish."
 *
 * The game is only worth playing if the answer is true. A guess-the-
 * favourite that reveals an arbitrary item is a small lie told to every
 * guest who plays it, and inventing popularity is the exact thing the
 * brief rules out.
 *
 * So the load-bearing behaviour is the FLOOR: below a handful of real
 * saves, nothing is called popular, and the round becomes the venue's own
 * pick worded as a pick.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Item = { id: string; name: string; imageUrl: string | null; priceCents: number; isFeatured: boolean };

const state: { saves: { menuItemId: string; qty: number }[]; items: Item[] } = { saves: [], items: [] };

function item(id: string, isFeatured = false): Item {
  return { id, name: `Item ${id}`, imageUrl: null, priceCents: 1000, isFeatured };
}

beforeEach(() => {
  state.saves = [];
  state.items = [item("a"), item("b"), item("c", true), item("d")];
  mock.module("@/lib/db", () => ({
    db: {
      wishlistItem: {
        groupBy: async () =>
          [...state.saves]
            .sort((x, y) => y.qty - x.qty)
            .map(s => ({ menuItemId: s.menuItemId, _sum: { quantity: s.qty } })),
      },
      menuItem: { findMany: async () => state.items },
    },
  }));
});

afterEach(() => { mock.restore(); });

describe("the answer is true or it isn't claimed", () => {
  test("with real saves above the floor, the top-saved item is the answer", async () => {
    state.saves = [{ menuItemId: "b", qty: 9 }, { menuItemId: "a", qty: 2 }];
    const { chefsPickRound } = await import("../chefs-pick");
    const round = await chefsPickRound({ venueId: "v", seed: "s1" });
    expect(round!.answerId).toBe("b");
    expect(round!.basis).toBe("popular");
  });

  test("below the floor, nothing is called popular", async () => {
    // Two saves is noise. Dressing it up as "what everyone's ordering"
    // would be inventing a fact.
    state.saves = [{ menuItemId: "b", qty: 2 }];
    const { chefsPickRound } = await import("../chefs-pick");
    const round = await chefsPickRound({ venueId: "v", seed: "s1" });
    expect(round!.basis).toBe("featured");
    expect(round!.answerId).toBe("c"); // the venue's own featured item
  });

  test("with no saves at all it still plays, as the kitchen's pick", async () => {
    const { chefsPickRound } = await import("../chefs-pick");
    const round = await chefsPickRound({ venueId: "v", seed: "s1" });
    expect(round!.basis).toBe("featured");
  });

  test("a top-saved item that's since been removed doesn't become the answer", async () => {
    state.saves = [{ menuItemId: "deleted", qty: 50 }];
    const { chefsPickRound } = await import("../chefs-pick");
    const round = await chefsPickRound({ venueId: "v", seed: "s1" });
    expect(round!.basis).toBe("featured");
    expect(state.items.some(i => i.id === round!.answerId)).toBe(true);
  });
});

describe("the round itself", () => {
  test("offers exactly three choices, including the answer", async () => {
    const { chefsPickRound } = await import("../chefs-pick");
    const round = await chefsPickRound({ venueId: "v", seed: "s1" });
    expect(round!.choices.length).toBe(3);
    expect(round!.choices.some(c => c.id === round!.answerId)).toBe(true);
  });

  test("no duplicate choices — a repeated option isn't a choice", async () => {
    const { chefsPickRound } = await import("../chefs-pick");
    const round = await chefsPickRound({ venueId: "v", seed: "s7" });
    expect(new Set(round!.choices.map(c => c.id)).size).toBe(3);
  });

  test("is stable for one guest, so tapping back doesn't reshuffle it", async () => {
    const { chefsPickRound } = await import("../chefs-pick");
    const a = await chefsPickRound({ venueId: "v", seed: "same" });
    const b = await chefsPickRound({ venueId: "v", seed: "same" });
    expect(a!.choices.map(c => c.id)).toEqual(b!.choices.map(c => c.id));
  });

  test("the answer isn't always in the same slot", async () => {
    const { chefsPickRound } = await import("../chefs-pick");
    const positions = new Set<number>();
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const r = await chefsPickRound({ venueId: "v", seed });
      positions.add(r!.choices.findIndex(c => c.id === r!.answerId));
    }
    // Otherwise the game is "always tap the first one".
    expect(positions.size).toBeGreaterThan(1);
  });

  test("a menu too small to choose from doesn't play", async () => {
    state.items = [item("a"), item("b")];
    const { chefsPickRound } = await import("../chefs-pick");
    expect(await chefsPickRound({ venueId: "v", seed: "s" })).toBeNull();
  });
});
