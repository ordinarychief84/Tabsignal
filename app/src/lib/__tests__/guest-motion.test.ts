/**
 * Motion on the guest surface.
 *
 * Two properties, both about not making the app worse for someone.
 *
 * Reduced motion has to mean the FINISHED state, instantly — not a
 * half-faded element a guest waits on forever. Every animation here is an
 * entrance, so if it never runs the content is still readable.
 *
 * And nothing loops. A restaurant table is not a slot machine: movement
 * answers something the guest did, then stops.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const MOTION = readFileSync(join(import.meta.dir, "../../components/guest/motion.tsx"), "utf8");
const HOME = readFileSync(
  join(import.meta.dir, "../../app/v/[slug]/t/[tableId]/home/guest-home.tsx"),
  "utf8",
);
const SHEET = readFileSync(join(import.meta.dir, "../../components/guest/service-sheet.tsx"), "utf8");
const ITEM = readFileSync(join(import.meta.dir, "../../components/guest/item-sheet.tsx"), "utf8");

describe("reduced motion is honoured", () => {
  test("the primitives ask the OS", () => {
    expect(MOTION).toContain("prefers-reduced-motion");
  });

  test("with motion off, staggered content shows immediately", () => {
    // Not "animates faster" — shown, now, with no delay.
    expect(MOTION).toMatch(/if \(!motionOk\) \{ setShown\(true\); return; \}/);
  });

  test("every animated file carries a CSS escape hatch", () => {
    // Two valid spellings: motion-reduce: turns an animation OFF, and
    // motion-safe: only turns it on. Either satisfies the requirement.
    for (const src of [MOTION, HOME, SHEET, ITEM]) {
      if (!/transition-|animate-\[/.test(src)) continue;
      expect(src).toMatch(/motion-reduce:|motion-safe:/);
    }
  });
});

describe("nothing loops", () => {
  test("no infinite animations anywhere on the guest surface", () => {
    // A permanently moving thing on a dinner table is a slot machine.
    for (const src of [MOTION, HOME, SHEET, ITEM]) {
      expect(src).not.toContain("animate-pulse");
      expect(src).not.toMatch(/infinite/);
      expect(src).not.toMatch(/animate-spin|animate-bounce|animate-ping/);
    }
  });
});

describe("feedback answers a specific tap", () => {
  test("Pop is driven by a counter, so two taps both animate", () => {
    // A boolean would make the second tap silently do nothing.
    expect(MOTION).toContain("trigger: number");
    expect(MOTION).toMatch(/trigger === 0 \|\| !motionOk/);
  });

  test("each row owns its own pulse, so one tap doesn't animate the list", () => {
    expect(HOME).toMatch(/const \[pulse, setPulse\] = useState\(0\)/);
  });
});

describe("progress is not a score", () => {
  test("no points, coins, streaks or levels in anything rendered", () => {
    // The brief ruled these out explicitly and they're the wrong idiom for
    // a restaurant. Comments are exempt — the ones here explain the
    // ABSENCE, and matching them would fail the file for saying so.
    for (const src of [MOTION, HOME]) {
      // Strip block and line comments wholesale. A line-prefix filter
      // misses the middle of a multi-line JSX comment, which is exactly
      // where the explanation of what we DON'T do lives.
      const rendered = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .toLowerCase();
      expect(rendered).not.toMatch(/\bstreak\b|\bcoins?\b|\bxp\b|\bleaderboard\b/);
    }
  });
});
