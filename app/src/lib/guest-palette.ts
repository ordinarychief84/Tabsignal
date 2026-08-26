/**
 * A whole palette from one brand colour.
 *
 * The guest app was white, oat and slate, with the venue's colour used for
 * a single background wash. That reads as safe rather than as anywhere in
 * particular — every venue's page looked the same.
 *
 * So: derive a family from `Venue.brandColor` and use it everywhere. The
 * colour a guest sees is the venue's own, which is the difference between
 * "colourful" and "decorated". A venue that never set one falls back to
 * TabCall's warm butter, which still reads as a room rather than a form.
 *
 * Pure, deterministic and client-safe so the server and the browser agree.
 */

export type GuestPalette = {
  /** The venue's colour, normalised to #rrggbb. */
  base: string;
  /** Washes, lightest first. For grounds and large fills. */
  wash: [string, string, string];
  /** A deeper relative, for edges and emphasis. */
  deep: string;
  /** Readable text ON the base colour — black or white, whichever wins. */
  on: string;
  /**
   * Per-section accents, rotated around the wheel from the base. Enough
   * separation that categories feel distinct, close enough that the menu
   * still looks like one restaurant.
   */
  accents: string[];
};

// Lowercase so it matches what normalizeHex returns for real input.
// Saffron — the brand accent, so a venue that never sets a colour
// still reads as TabCall rather than as nothing.
const FALLBACK = "#f4c95d";
/** Deep Plum — the brand's text colour on light surfaces. */
const TEXT_ON_LIGHT = "#34263f";

export function guestPalette(brandColor: string | null | undefined): GuestPalette {
  const base = normalizeHex(brandColor) ?? FALLBACK;
  const [h, s, l] = hexToHsl(base);

  return {
    base,
    wash: [
      hslToHex(h, clamp(s * 0.55, 0, 70), 96),
      hslToHex(h, clamp(s * 0.7, 0, 75), 90),
      hslToHex(h, clamp(s * 0.85, 0, 80), 82),
    ],
    deep: hslToHex(h, clamp(s * 1.05, 0, 90), clamp(l - 26, 18, 45)),
    on: readableOn(base),
    // Golden-ish spacing so neighbouring sections never collide, and a
    // fixed lightness so no accent shouts louder than another.
    accents: [0, 42, 84, 210, 252, 300].map(shift =>
      hslToHex((h + shift) % 360, clamp(Math.max(s, 45), 40, 72), 78),
    ),
  };
}

/**
 * Accent for a section.
 *
 * Prefer passing the section's INDEX. Hashing a name across six buckets
 * collides often enough that two categories sitting next to each other
 * come out the same colour, which defeats the point of colouring them at
 * all. An index guarantees neighbours differ. The hash is only the
 * fallback for callers with no ordering.
 */
export function accentFor(
  palette: GuestPalette,
  key: string,
  index?: number,
): string {
  const slot =
    index === undefined
      ? Math.abs(hash(key)) % palette.accents.length
      : index % palette.accents.length;
  return palette.accents[slot]!;
}

/* ----------------------------- colour maths ---------------------------- */

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  if (!v.startsWith("#")) v = `#${v}`;
  // #abc → #aabbcc
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    v = "#" + v.slice(1).split("").map(c => c + c).join("");
  }
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexToHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = hexToRgb(hex).map(v => v / 255) as [number, number, number];
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) / 6;
  else if (max === g0) h = ((b0 - r0) / d + 2) / 6;
  else h = ((r0 - g0) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] =
    [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg] ?? [0, 0, 0];
  const to = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Black or white, whichever is actually readable. Picked by relative
 * luminance rather than a lightness guess — a saturated brand colour can
 * be "light" in HSL and still need white text.
 */
function readableOn(hex: string): string {
  // Compare against the ACTUAL candidates. This used to assume the dark
  // option was pure black (luminance 0) while returning Deep Plum, so for
  // some brand colours it confidently picked the LOWER-contrast option —
  // caught by the test that checks the choice really is the better one.
  const candidates = [TEXT_ON_LIGHT, "#ffffff"];
  let best = candidates[0]!;
  let bestRatio = -1;
  for (const candidate of candidates) {
    const ratio = contrastRatio(hex, candidate);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return best;
}

/** Relative luminance, per WCAG. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}


function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return h;
}
