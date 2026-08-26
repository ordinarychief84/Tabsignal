/**
 * The marketing site must only sell what the product does.
 *
 * This audit found the site advertising Stripe guest payments, bill
 * splitting, tip pooling and pre-order via QR — all removed — plus a
 * loyalty programme whose points nothing awards and POS connectors that
 * return "not implemented". At $99–$299 a month, that isn't stale copy;
 * it's selling something that doesn't exist.
 *
 * So this is a guard, not a style check. Marketing copy drifts from the
 * product silently, and nobody notices until a prospect asks for a demo of
 * a feature nobody can show them.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { PLANS } from "../plans";

const APP = join(import.meta.dir, "../../app");
const LIB = join(import.meta.dir, "..");

/** Pages a prospect reads before they pay. */
const MARKETING = [
  join(APP, "page.tsx"),
  join(APP, "pricing/page.tsx"),
  join(APP, "features/page.tsx"),
  join(APP, "how-it-works/page.tsx"),
  join(LIB, "features-data.ts"),
  join(LIB, "plans.ts"),
].filter(existsSync);

function rendered(file: string): string {
  // Comments explain what was REMOVED and why; matching them would fail
  // the file for documenting its own history.
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Claims for capabilities the product no longer has. Each is a phrase that
 * only makes sense if we do the thing.
 */
const RETIRED_CLAIMS: [RegExp, string][] = [
  [/\bpay bill\b/i,                 "guest bill payment"],
  [/\bfast pay\b/i,                 "guest bill payment"],
  [/pay(s|ing)? (instantly|at (their|the) table)/i, "guest bill payment"],
  [/split (the |it )?(bill|by weight)/i, "bill splitting"],
  [/\btip pool/i,                   "tip pooling"],
  [/\bapple pay\b|\bgoogle pay\b/i, "wallet payments"],
  [/\bpre-?order/i,                 "pre-order via QR"],
  [/orders? and payments? sync/i,   "POS order/payment sync"],
  [/stripe processing/i,            "guest card processing"],
];

describe("nothing sold is gone", () => {
  test("no marketing page claims a retired capability", () => {
    const offenders: string[] = [];
    for (const file of MARKETING) {
      const src = rendered(file);
      for (const [pattern, what] of RETIRED_CLAIMS) {
        if (pattern.test(src)) {
          offenders.push(`${file.split("/").slice(-2).join("/")} claims ${what}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("plan feature lists don't sell removed capabilities", () => {
    // The tier lists are the most load-bearing copy in the product: they
    // are what a venue believes they bought.
    const all = PLANS.flatMap(p => p.features).join(" | ").toLowerCase();
    for (const gone of [
      "stripe payments", "connect", "tip pool", "pre-order", "loyalty",
      "bill split", "apple pay",
    ]) {
      expect(all).not.toContain(gone);
    }
  });
});

describe("every plan still describes something real", () => {
  test("all three tiers list features", () => {
    for (const plan of PLANS) {
      expect(plan.features.length).toBeGreaterThan(2);
      expect(plan.tagline.length).toBeGreaterThan(10);
    }
  });

  test("paid tiers cost what the pricing page says", () => {
    // Drift here is a billing dispute waiting to happen.
    expect(PLANS.find(p => p.id === "free")!.monthlyCents).toBe(0);
    expect(PLANS.find(p => p.id === "growth")!.monthlyCents).toBe(9900);
    expect(PLANS.find(p => p.id === "pro")!.monthlyCents).toBe(29900);
  });
});

describe("linked feature pages resolve", () => {
  test("every /features/<slug> the homepage links to actually exists", () => {
    // The homepage linked to /features/qr-payments, which 404s — a dead
    // link in the hero of the site.
    const featuresData = readFileSync(join(LIB, "features-data.ts"), "utf8");
    const realSlugs = [...featuresData.matchAll(/slug:\s*"([a-z-]+)"/g)].map(m => m[1]!);
    const home = readFileSync(join(APP, "page.tsx"), "utf8");
    const linked = [...home.matchAll(/\/features\/([a-z-]+)/g)].map(m => m[1]!);
    for (const slug of linked) {
      expect(realSlugs).toContain(slug);
    }
  });
});
