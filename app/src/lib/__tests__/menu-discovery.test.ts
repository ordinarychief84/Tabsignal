/**
 * "What are you in the mood for?"
 *
 * Deterministic by design — the prompts map to tags the venue set, so the
 * answer to "something light" is whatever that kitchen decided is light.
 * No model, no per-scan cost, and explainable to an owner in a sentence.
 */

import { describe, expect, test } from "bun:test";
import { MOOD_PROMPTS, promptById, itemsForPrompt, availablePrompts } from "../menu-discovery";

const ITEMS = [
  { id: "a", tags: ["light", "salad"], isFeatured: false },
  { id: "b", tags: ["filling", "main"], isFeatured: true },
  { id: "c", tags: ["drink", "cocktail"], isFeatured: false },
  { id: "d", tags: [], isFeatured: false },
];

describe("prompt matching", () => {
  test("matches on the venue's own tags", () => {
    expect(itemsForPrompt(promptById("light")!, ITEMS).map(i => i.id)).toEqual(["a"]);
    expect(itemsForPrompt(promptById("drinks")!, ITEMS).map(i => i.id)).toEqual(["c"]);
  });

  test("is case-insensitive about how a venue typed a tag", () => {
    const items = [{ id: "x", tags: ["LIGHT"], isFeatured: false }];
    expect(itemsForPrompt(promptById("light")!, items).map(i => i.id)).toEqual(["x"]);
  });

  test("an untagged item matches no prompt", () => {
    for (const p of MOOD_PROMPTS.filter(p => p.tags.length > 0)) {
      expect(itemsForPrompt(p, [ITEMS[3]!])).toEqual([]);
    }
  });
});

describe("surprise me", () => {
  test("returns something rather than nothing", () => {
    const out = itemsForPrompt(promptById("surprise")!, ITEMS, "seed-1");
    expect(out.length).toBeGreaterThan(0);
  });

  test("is stable for the same guest — tapping back gives the same answer", () => {
    const a = itemsForPrompt(promptById("surprise")!, ITEMS, "session-abc").map(i => i.id);
    const b = itemsForPrompt(promptById("surprise")!, ITEMS, "session-abc").map(i => i.id);
    expect(a).toEqual(b);
  });

  test("leads with something the venue is proud of", () => {
    const out = itemsForPrompt(promptById("surprise")!, ITEMS, "session-abc");
    expect(out[0]!.isFeatured).toBe(true);
  });

  test("copes with an empty menu", () => {
    expect(itemsForPrompt(promptById("surprise")!, [], "s")).toEqual([]);
  });
});

describe("availablePrompts", () => {
  test("hides prompts a venue has nothing tagged for", () => {
    const ids = availablePrompts(ITEMS).map(p => p.id);
    expect(ids).toContain("light");
    expect(ids).toContain("drinks");
    // Nothing is tagged sweet, so the chip isn't shown empty.
    expect(ids).not.toContain("sweet");
  });

  test("a venue that tags nothing gets no discovery row at all", () => {
    const untagged = [{ id: "x", tags: [], isFeatured: false }];
    // Only "surprise me" could match, and a discovery row with one
    // meaningless chip is worse than none.
    expect(availablePrompts(untagged).every(p => p.id === "surprise")).toBe(true);
  });

  test("an empty menu shows nothing", () => {
    expect(availablePrompts([])).toEqual([]);
  });
});
