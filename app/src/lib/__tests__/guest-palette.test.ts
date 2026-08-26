/**
 * A palette derived from the venue's own colour.
 *
 * The property that actually matters is contrast: `on` decides whether
 * text sits black or white on the brand colour, and getting it wrong makes
 * a guest's screen unreadable in a dim room. It's computed from relative
 * luminance rather than an HSL lightness guess, because a saturated colour
 * can be "light" by lightness and still need white text.
 */

import { describe, expect, test } from "bun:test";
import { guestPalette, accentFor } from "../guest-palette";

const contrast = (hex: string, other: string) => {
  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(hex);
  const b = lum(other);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe("text stays readable on any brand colour", () => {
  test("picks the higher-contrast option every time", () => {
    for (const brand of [
      "#F2E7B7", "#000000", "#ffffff", "#1a1a2e", "#e94560",
      "#0f3460", "#ffd60a", "#7b2cbf", "#06d6a0",
    ]) {
      const p = guestPalette(brand);
      const chosen = contrast(p.base, p.on);
      const other = contrast(p.base, p.on === "#ffffff" ? "#34263f" : "#ffffff");
      expect(chosen).toBeGreaterThanOrEqual(other);
    }
  });

  test("a bright yellow gets Deep Plum text, not white", () => {
    // The classic failure: yellow is "light" so white text looks right in
    // a spec and is invisible on a phone.
    expect(guestPalette("#ffd60a").on).toBe("#34263f");
  });

  test("a deep navy gets white text", () => {
    expect(guestPalette("#0f3460").on).toBe("#ffffff");
  });
});

describe("input tolerance", () => {
  test("accepts the shapes a venue actually types", () => {
    const expected = guestPalette("#f2e7b7").base;
    for (const v of ["#F2E7B7", "f2e7b7", "  #f2e7b7  ", "#F2E7B7"]) {
      expect(guestPalette(v).base).toBe(expected);
    }
  });

  test("expands three-digit hex", () => {
    expect(guestPalette("#fb0").base).toBe("#ffbb00");
  });

  test("falls back rather than throwing on junk", () => {
    for (const bad of [null, undefined, "", "not a colour", "#12345", "rgb(1,2,3)"]) {
      expect(guestPalette(bad).base).toBe("#f4c95d");
    }
  });
});

describe("section accents", () => {
  test("every accent is a valid hex", () => {
    for (const a of guestPalette("#e94560").accents) {
      expect(a).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("neighbouring sections don't collide", () => {
    const { accents } = guestPalette("#e94560");
    expect(new Set(accents).size).toBe(accents.length);
  });

  test("a category keeps the same accent across renders", () => {
    // Otherwise the menu reshuffles colour on every navigation.
    const p = guestPalette("#e94560");
    expect(accentFor(p, "Cocktails", 0)).toBe(accentFor(p, "Cocktails", 0));
  });

  test("neighbouring sections never come out the same colour", () => {
    // Hashing names across six buckets collides often enough that two
    // adjacent categories matched, which defeats colouring them at all.
    const p = guestPalette("#e94560");
    const six = [0, 1, 2, 3, 4, 5].map(i => accentFor(p, `cat${i}`, i));
    expect(new Set(six).size).toBe(6);
    for (let i = 1; i < six.length; i++) {
      expect(six[i]).not.toBe(six[i - 1]);
    }
  });

  test("washes get lighter in order", () => {
    const { wash } = guestPalette("#0f3460");
    const lum = (h: string) => parseInt(h.slice(1), 16);
    expect(lum(wash[0])).toBeGreaterThan(lum(wash[2]));
  });
});
