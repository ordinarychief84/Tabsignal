/**
 * The four-face rating and its tag vocabularies.
 *
 * The mapping is the load-bearing part: the guest sees four faces, the
 * database keeps the 1-5 integer every existing report, average and the
 * ≥4 Google-review threshold already reads. Get this wrong and every
 * historical row silently changes meaning.
 */

import { describe, expect, test } from "bun:test";
import {
  RATING_CHOICES,
  sentimentFor,
  isPositive,
  sanitizeTags,
  tagLabel,
  POSITIVE_TAGS,
  NEGATIVE_TAGS,
  SERVER_TAG,
} from "../feedback";

describe("rating scale", () => {
  test("maps the four faces onto the existing 1-5 scale", () => {
    expect(RATING_CHOICES.map(c => c.value)).toEqual([1, 2, 4, 5]);
  });

  test("skips 3 so 'Okay' stays on the negative side of the ≥4 threshold", () => {
    // A middling experience is a problem to fix, not a neutral outcome.
    // (Widened to number: the literal union already excludes 3, and TS
    // rejects the comparison outright — the point is to catch a future
    // edit that ADDS it.)
    expect((RATING_CHOICES as readonly { value: number }[]).some(c => c.value === 3)).toBe(false);
    expect(isPositive(2)).toBe(false);
    expect(isPositive(4)).toBe(true);
  });

  test("agrees with the existing ≥4 threshold used for Google review prompts", () => {
    expect(sentimentFor(1)).toBe("NEGATIVE");
    expect(sentimentFor(2)).toBe("NEGATIVE");
    expect(sentimentFor(3)).toBe("NEUTRAL");
    expect(sentimentFor(4)).toBe("POSITIVE");
    expect(sentimentFor(5)).toBe("POSITIVE");
  });

  test("every choice carries a face and a written label, not just an emoji", () => {
    // Emoji alone isn't accessible and isn't storable as meaning.
    for (const c of RATING_CHOICES) {
      expect(c.face.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});

describe("sanitizeTags", () => {
  test("keeps tags from the vocabulary matching the rating", () => {
    expect(sanitizeTags(5, ["service", "food"]).sort()).toEqual(["food", "service"]);
    expect(sanitizeTags(1, ["wait_time", "cleanliness"]).sort()).toEqual(["cleanliness", "wait_time"]);
  });

  test("drops tags from the other rating's vocabulary", () => {
    // "cleanliness" is a complaint; it has no meaning on a 5-star report.
    expect(sanitizeTags(5, ["cleanliness"])).toEqual([]);
    expect(sanitizeTags(1, ["atmosphere"])).toEqual([]);
  });

  test("refuses arbitrary strings — a guest can't inject into a dashboard", () => {
    expect(sanitizeTags(5, ["<script>alert(1)</script>", "'; DROP TABLE"])).toEqual([]);
  });

  test("survives junk input instead of throwing", () => {
    // A malformed tag must never cost the guest their rating.
    for (const junk of [null, undefined, "service", 42, {}, [1, 2, 3]]) {
      expect(sanitizeTags(5, junk)).toEqual([]);
    }
  });

  test("dedupes and caps", () => {
    expect(sanitizeTags(5, ["food", "food", "FOOD", " food "])).toEqual(["food"]);
    expect(sanitizeTags(5, Array(50).fill("food")).length).toBe(1);
  });
});

describe("tagLabel", () => {
  test("resolves the server placeholder to the actual name", () => {
    expect(tagLabel(SERVER_TAG, "Sarah")).toBe("Sarah was amazing");
  });

  test("reads correctly when no server is assigned", () => {
    expect(tagLabel(SERVER_TAG, null)).toBe("Our server was amazing");
  });

  test("works for any name, not one baked-in example", () => {
    expect(tagLabel(SERVER_TAG, "Amara")).toBe("Amara was amazing");
    expect(tagLabel(SERVER_TAG, "Wes")).toBe("Wes was amazing");
  });

  test("the stored tag stays aggregatable across servers", () => {
    // Stored as the placeholder, rendered per-server — so "our server was
    // great" is countable venue-wide.
    expect(POSITIVE_TAGS.find(t => t.id === SERVER_TAG)).toBeDefined();
    expect(sanitizeTags(5, [SERVER_TAG])).toEqual([SERVER_TAG]);
  });

  test("vocabularies have no duplicate ids within themselves", () => {
    for (const vocab of [POSITIVE_TAGS, NEGATIVE_TAGS]) {
      const ids = vocab.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
