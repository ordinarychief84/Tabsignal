/**
 * The returning-guest scheme.
 *
 * The mockup for this drew a points economy: a balance, tiers, "$20 off
 * your next visit". These tests exist to keep that from creeping back
 * in, because it is the single most tempting thing to add and the single
 * most dishonest.
 *
 * TabCall does not process payments and cannot see a bill. A "$20 off"
 * shown in a venue's name is a promise the venue never made, redeemable
 * at a till that has never heard of it — and the guest finds that out in
 * front of a staff member who also didn't know. So: the venue writes the
 * reward in its own words, or nothing is shown at all.
 *
 * The other property defended here is that `enabled` alone is not enough
 * to show anything. A venue that switched the scheme on and never said
 * what the reward is would otherwise get a progress bar leading nowhere,
 * which is worse than no bar — it implies a promise.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  MAX_LABEL,
  MAX_VISITS,
  MIN_VISITS,
  VISIT_PROGRAM_DEFAULTS,
  isRunnable,
  mergeVisitProgram,
  progressFor,
  progressHeadline,
  redeemHint,
  visitProgramFrom,
} from "@/lib/visit-progress";

const runnable = {
  enabled: true,
  visitsRequired: 3,
  rewardLabel: "A dessert on us",
  programName: "Regulars",
};

describe("defaults", () => {
  test("the scheme is off until a venue turns it on", () => {
    // Everything else in the guest experience defaults ON. This one makes
    // a promise on the venue's behalf, so it can't.
    expect(VISIT_PROGRAM_DEFAULTS.enabled).toBe(false);
  });

  test("there is no default reward", () => {
    // A default here would be TabCall inventing the offer.
    expect(VISIT_PROGRAM_DEFAULTS.rewardLabel).toBe("");
  });
});

describe("isRunnable", () => {
  test("needs both the switch and the reward", () => {
    expect(isRunnable(runnable)).toBe(true);
    expect(isRunnable({ ...runnable, enabled: false })).toBe(false);
    expect(isRunnable({ ...runnable, rewardLabel: "" })).toBe(false);
    expect(isRunnable({ ...runnable, rewardLabel: "   " })).toBe(false);
  });
});

describe("progressFor", () => {
  test("counts a returning guest towards the venue's number", () => {
    const p = progressFor({ visits: 2, config: runnable })!;
    expect(p.visits).toBe(2);
    expect(p.required).toBe(3);
    expect(p.remaining).toBe(1);
    expect(p.earned).toBe(false);
    expect(p.fraction).toBeCloseTo(2 / 3);
  });

  test("earned once the count is met", () => {
    expect(progressFor({ visits: 3, config: runnable })!.earned).toBe(true);
  });

  test("an over-achiever doesn't overflow the bar", () => {
    const p = progressFor({ visits: 99, config: runnable })!;
    expect(p.fraction).toBe(1);
    expect(p.remaining).toBe(0);
  });

  test("a first-time guest sees nothing", () => {
    // "0 of 3 visits" on someone's first ever scan is a scoreboard shown
    // to a stranger.
    expect(progressFor({ visits: 0, config: runnable })).toBeNull();
  });

  test("nothing shows when the venue never wrote a reward", () => {
    expect(progressFor({ visits: 5, config: { ...runnable, rewardLabel: "" } })).toBeNull();
  });

  test("nothing shows when the scheme is off", () => {
    expect(progressFor({ visits: 5, config: { ...runnable, enabled: false } })).toBeNull();
  });

  test("the reward comes back exactly as the venue wrote it", () => {
    const p = progressFor({ visits: 1, config: { ...runnable, rewardLabel: "£5 off pizza" } })!;
    expect(p.rewardLabel).toBe("£5 off pizza");
  });
});

describe("the copy never invents an offer", () => {
  test("the headline describes progress, never the reward", () => {
    // The moment this says "on the house" or "free", TabCall has made up
    // an offer the venue didn't.
    const lines = [
      progressHeadline(progressFor({ visits: 1, config: runnable })!),
      progressHeadline(progressFor({ visits: 2, config: runnable })!),
      progressHeadline(progressFor({ visits: 3, config: runnable })!),
    ];
    for (const line of lines) {
      const l = line.toLowerCase();
      for (const banned of ["free", "on the house", "off", "discount", "$", "£", "%"]) {
        expect(l).not.toContain(banned);
      }
    }
  });

  test("plural agreement, because 1 more visits reads as a bug", () => {
    expect(progressHeadline(progressFor({ visits: 2, config: runnable })!)).toBe("One more visit");
    expect(progressHeadline(progressFor({ visits: 1, config: runnable })!)).toBe("2 more visits");
  });

  test("an earned reward tells the guest to mention it", () => {
    // TabCall cannot apply anything to a bill it can't see. A guest who
    // believes the app handled it is disappointed at the till.
    const hint = redeemHint(progressFor({ visits: 3, config: runnable })!, "Luna");
    expect(hint.toLowerCase()).toContain("mention");
    expect(hint).toContain("Luna");
  });

  test("no module anywhere promises a cash amount", () => {
    const src = readFileSync(join(import.meta.dir, "../visit-progress.ts"), "utf8");
    const rendered = src
      .split("\n")
      .filter(l => {
        const t = l.trim();
        return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n");
    // No hardcoded currency in anything that reaches a guest.
    expect(rendered).not.toMatch(/["'`][^"'`]*[$£€]\s?\d/);
  });
});

describe("this is not a points economy", () => {
  test("nothing here accrues, expires or redeems a balance", () => {
    const src = readFileSync(join(import.meta.dir, "../visit-progress.ts"), "utf8");
    const rendered = src
      .split("\n")
      .filter(l => {
        const t = l.trim();
        return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n")
      .toLowerCase();
    // Word boundaries, not substrings: "xp" lives inside "export" and
    // "tier" inside "identifier", and a naive scan fails the file for
    // words that have nothing to do with a points economy.
    for (const banned of ["points", "balance", "tier", "accrue", "streak", "xp", "coins"]) {
      expect(rendered).not.toMatch(new RegExp(`\\b${banned}\\b`));
    }
  });

  test("what a guest sees is a count of visits, not a currency", () => {
    const p = progressFor({ visits: 2, config: runnable })!;
    expect(Number.isInteger(p.visits)).toBe(true);
    expect(Object.keys(p)).not.toContain("points");
    expect(Object.keys(p)).not.toContain("balance");
  });
});

describe("reading and merging config", () => {
  test("an empty column gives the defaults", () => {
    expect(visitProgramFrom(null)).toEqual(VISIT_PROGRAM_DEFAULTS);
    expect(visitProgramFrom({})).toEqual(VISIT_PROGRAM_DEFAULTS);
    expect(visitProgramFrom("nonsense")).toEqual(VISIT_PROGRAM_DEFAULTS);
    expect(visitProgramFrom([1, 2])).toEqual(VISIT_PROGRAM_DEFAULTS);
  });

  test("reads what a venue set", () => {
    expect(visitProgramFrom({ visitProgram: runnable })).toEqual(runnable);
  });

  test("clamps a silly visit count instead of storing it", () => {
    expect(visitProgramFrom({ visitProgram: { visitsRequired: 500 } }).visitsRequired).toBe(
      MAX_VISITS,
    );
    expect(visitProgramFrom({ visitProgram: { visitsRequired: 0 } }).visitsRequired).toBe(
      MIN_VISITS,
    );
    expect(visitProgramFrom({ visitProgram: { visitsRequired: -3 } }).visitsRequired).toBe(
      MIN_VISITS,
    );
  });

  test("ignores values of the wrong type rather than throwing", () => {
    const out = visitProgramFrom({
      visitProgram: { enabled: "yes", visitsRequired: "lots", rewardLabel: 42 },
    });
    expect(out).toEqual(VISIT_PROGRAM_DEFAULTS);
  });

  test("truncates an overlong reward", () => {
    const long = "x".repeat(500);
    expect(visitProgramFrom({ visitProgram: { rewardLabel: long } }).rewardLabel.length).toBe(
      MAX_LABEL,
    );
  });

  test("merging preserves keys other features own", () => {
    // The column predates this feature and holds guestExperience too.
    const existing = { guestExperience: { feedback: false }, somethingElse: 1 };
    const merged = mergeVisitProgram(existing, { enabled: true });
    expect(merged.guestExperience).toEqual({ feedback: false });
    expect(merged.somethingElse).toBe(1);
    expect((merged.visitProgram as { enabled: boolean }).enabled).toBe(true);
  });

  test("merging only changes what was sent", () => {
    const merged = mergeVisitProgram({ visitProgram: runnable }, { visitsRequired: 5 });
    const next = merged.visitProgram as typeof runnable;
    expect(next.visitsRequired).toBe(5);
    expect(next.rewardLabel).toBe("A dessert on us");
    expect(next.enabled).toBe(true);
  });
});
