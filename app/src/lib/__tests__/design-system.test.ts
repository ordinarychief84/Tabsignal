/**
 * The TabCall brand, as a contract.
 *
 * A design system that lives only in a stylesheet drifts the moment
 * someone types a hex into a component. These are the rules that keep the
 * brand from eroding — the same class of guard as the RLS coverage test.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");
const TAILWIND = readFileSync(join(ROOT, "../tailwind.config.ts"), "utf8");
const GLOBALS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

/** Every approved brand colour. */
const BRAND = {
  plum: "#34263F",
  saffron: "#F4C95D",
  mint: "#CFE3D8",
  apricot: "#F2B38F",
  clay: "#D97878",
  ivory: "#FBF8F2",
  graphite: "#403A43",
  sandstone: "#E8E0D7",
};

/** Colours from the retired palette that must not come back. */
const RETIRED = [
  "#F2E7B7", // Warm Butter
  "#232130", // Deep Ink
  "#0d0b19", // landing near-black
  "#6F9586", // Deep Sage
  "#C8634F", // Terracotta
  "#D7FF3C", // acid lime
  "#F7F5F2", // Soft Linen
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = walk(ROOT);

describe("the palette is defined once", () => {
  test("every brand colour is a Tailwind token", () => {
    for (const [name, hex] of Object.entries(BRAND)) {
      expect(TAILWIND.toLowerCase()).toContain(hex.toLowerCase());
      expect(TAILWIND).toContain(name);
    }
  });

  test("semantic tokens exist for meaning, not just hue", () => {
    for (const token of [
      "--color-brand-primary", "--color-brand-accent", "--color-background",
      "--color-surface", "--color-text-primary", "--color-text-secondary",
      "--color-border", "--color-success", "--color-promotion", "--color-danger",
      "--color-focus-ring", "--color-selected", "--color-disabled", "--color-warning",
      "--color-service-pending", "--color-service-acknowledged",
      "--color-service-completed", "--color-service-overdue",
    ]) {
      expect(GLOBALS).toContain(token);
    }
  });
});

describe("the retired palette is gone", () => {
  test("no component carries a colour from the old brand", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const src = readFileSync(file, "utf8");
      for (const hex of RETIRED) {
        // The Tailwind config is allowed to mention them in comments that
        // explain what a token USED to be.
        if (file.endsWith("tailwind.config.ts")) continue;
        if (new RegExp(hex, "i").test(src)) {
          offenders.push(`${file.replace(ROOT, "")} → ${hex}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the guest surface is light", () => {
  test("the dark guest canvas no longer paints itself dark", () => {
    // The brief is explicit: the guest app must not be dark. The class is
    // kept as a no-op for older routes rather than deleted.
    const guestDark = GLOBALS.slice(GLOBALS.indexOf(".guest-dark"));
    expect(guestDark).not.toMatch(/background-color:\s*#0b0a12/i);
    expect(guestDark).toContain("var(--color-background)");
  });
});

describe("typography", () => {
  test("Poppins is the loaded family", () => {
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    expect(layout).toContain("Poppins");
    expect(layout).not.toContain("Inter");
  });

  test("only the four approved weights are requested", () => {
    // Every extra weight is another font file on a guest's phone.
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/weight: \["400", "500", "600", "700"\]/);
  });
});

describe("the logo has one definition", () => {
  test("a Logo component exists with the approved treatment", () => {
    const logo = readFileSync(join(ROOT, "components/brand/logo.tsx"), "utf8");
    // Deep Plum container, Saffron symbol — and no decoration.
    expect(logo).toContain("bg-plum");
    expect(logo).toContain("#F4C95D");
    // Comments stripped: the docblock explains the ABSENCE of these, and
    // matching it would fail the file for saying so.
    const rendered = logo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(rendered).not.toMatch(/drop-shadow|gradient|blur-|glow/);
  });
});
