/**
 * Bulk menu import — parsing a menu someone already has.
 *
 * Every venue arrives with their menu already written down: in a
 * spreadsheet, a Word doc, or the back of a printed card. Retyping forty
 * items one dialog at a time is the reason menus don't get finished, so
 * this takes a paste and turns it into items.
 *
 * Deliberately forgiving about format because the input is whatever was
 * on someone's clipboard:
 *
 *   Margherita, 14.00, Classic tomato and basil, light
 *   Margherita | 14 | Classic tomato and basil
 *   Margherita<TAB>14.00
 *   ## Pizza                    <- a heading becomes the category
 *
 * Deliberately strict about money: a row whose price can't be read is
 * REPORTED, never guessed. Silently importing "14.00.00" as $14 would put
 * a wrong price in front of guests, which is worse than making someone fix
 * one line.
 *
 * Pure and client-safe so the editor can preview exactly what will be
 * created before anything is written.
 */

import { normalizeTags } from "./menu-discovery";

export type ParsedItem = {
  /** 1-based, for pointing at the offending line. */
  line: number;
  name: string;
  priceCents: number;
  description: string | null;
  tags: string[];
  /** From the most recent heading, if any. */
  category: string | null;
};

export type ParseError = { line: number; text: string; reason: string };

export type ParseResult = {
  items: ParsedItem[];
  errors: ParseError[];
  /** Category names in the order they first appeared. */
  categories: string[];
};

/** Headings: "## Pizza", "# Pizza", "[Pizza]", or "Pizza:" alone on a line. */
function headingOf(line: string): string | null {
  const trimmed = line.trim();
  const hashed = /^#{1,3}\s*(.+?)\s*$/.exec(trimmed);
  if (hashed) return hashed[1]!;
  const bracketed = /^\[(.+?)\]$/.exec(trimmed);
  if (bracketed) return bracketed[1]!;
  // "Starters:" — a label with nothing after the colon.
  const colon = /^(.+?):\s*$/.exec(trimmed);
  if (colon && !/\d/.test(colon[1]!)) return colon[1]!;
  return null;
}

/**
 * Read a price. Accepts "14", "14.5", "$14.00", "£14", "14,50" (comma
 * decimal). Returns null rather than guessing.
 */
export function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  // Reject anything carrying letters BEFORE stripping. Otherwise "1e5"
  // strips to "15" and quietly becomes $15.00, and "14.00 each" becomes
  // $14 — both are invented prices, which is the one thing this must
  // never do. A currency symbol is not a letter, so "$14" still reads.
  if (/[a-z]/i.test(trimmed)) return null;
  const cleaned = trimmed.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  // European decimal comma, but only when there's no dot in play.
  const normalized = cleaned.includes(".") ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 100_000) return null;
  return Math.round(value * 100);
}

/** Split on tab, pipe, or comma — whichever the row actually uses. */
function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes("|")) return line.split("|");
  return line.split(",");
}

export function parseMenuText(input: string): ParseResult {
  const items: ParsedItem[] = [];
  const errors: ParseError[] = [];
  const categories: string[] = [];
  let current: string | null = null;

  const lines = input.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const lineNo = i + 1;
    if (!line) return;

    const heading = headingOf(line);
    if (heading) {
      current = heading;
      if (!categories.includes(heading)) categories.push(heading);
      return;
    }

    let parts = splitRow(line).map(p => p.trim());

    // Nothing to split on. Plenty of menus are written "Margherita 14.00",
    // "Soup of the day: 8", or with dot leaders — the price is at the end
    // of the same field. Peel it off rather than rejecting the line.
    if (parts.length === 1) {
      // The separator is REQUIRED (+ not *). Without it, "Dish 1e5" peels
      // the trailing "5" off and imports a $5 item — the same invented
      // price the letter guard in parsePrice exists to stop.
      const tail = /^(.*?)[\s.:·—–-]+([$£€]?\s*\d+(?:[.,]\d{1,2})?)\s*$/.exec(parts[0]!);
      if (tail && tail[1]!.trim() && parsePrice(tail[2]!) !== null) {
        parts = [tail[1]!.trim().replace(/[\s.:·—–-]+$/, ""), tail[2]!];
      }
    }

    const name = parts[0] ?? "";
    if (!name) {
      errors.push({ line: lineNo, text: line, reason: "No item name" });
      return;
    }

    // Find the first field that reads as money. Usually the second, but a
    // pasted spreadsheet may carry a leading blank column.
    let priceCents: number | null = null;
    let priceIndex = -1;
    for (let p = 1; p < parts.length; p++) {
      const candidate = parsePrice(parts[p]!);
      if (candidate !== null) {
        priceCents = candidate;
        priceIndex = p;
        break;
      }
    }
    if (priceCents === null) {
      errors.push({
        line: lineNo,
        text: line,
        reason: parts.length < 2 ? "No price on this line" : "Couldn't read the price",
      });
      return;
    }

    const rest = parts.filter((_, idx) => idx !== 0 && idx !== priceIndex);
    // Anything after the price: the longest field is the description, and
    // short comma-free leftovers are treated as tags.
    const description = rest.find(r => r.length > 24) ?? rest[0] ?? null;
    const tagCandidates = rest.filter(r => r !== description && r.length <= 24);

    items.push({
      line: lineNo,
      name: name.slice(0, 120),
      priceCents,
      description: description ? description.slice(0, 500) : null,
      tags: normalizeTags(tagCandidates),
      category: current,
    });
  });

  return { items, errors, categories };
}
