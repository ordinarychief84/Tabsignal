/**
 * Pairings are reachable from both ends.
 *
 * This codebase has shipped the same shape of bug four times: a real
 * table, a real API, and nothing on any screen that reaches it. Menu tags
 * landed with no editor field. Staff display names landed with no form.
 * `service_recovery` fired into a screen that wasn't listening. Feedback
 * shipped behind a flag with no link to it.
 *
 * A pairing feature is especially exposed to this, because it has TWO
 * ends that can independently be missing: somewhere for a venue to write
 * the pairing down, and somewhere a guest reads it back. Either one
 * absent makes the whole feature dead weight while every unit test still
 * passes.
 *
 * So: assert the editor mounts the field, the field can actually write,
 * the guest page loads the rows, and the guest surface renders them.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const EDITOR = read("app/admin/v/[slug]/menu/item-editor.tsx");
const PANEL = read("app/admin/v/[slug]/menu/menu-panel.tsx");
const FIELD_PATH = join(ROOT, "app/admin/v/[slug]/menu/pairings-field.tsx");
const API_PATH = join(ROOT, "app/api/admin/v/[slug]/menu/items/[id]/pairings/route.ts");
const GUEST_PAGE = read("app/v/[slug]/t/[tableId]/home/page.tsx");
const GUEST_HOME = read("app/v/[slug]/t/[tableId]/home/guest-home.tsx");

describe("a venue can actually author a pairing", () => {
  test("the editor field exists", () => {
    expect(existsSync(FIELD_PATH)).toBe(true);
  });

  test("the item editor mounts it", () => {
    // The failure mode: a field component nobody renders.
    expect(EDITOR).toContain("<PairingsField");
  });

  test("the editor is given the rest of the menu to choose from", () => {
    // A pairing picker with no candidates is a dropdown of nothing.
    expect(EDITOR).toContain("menuItems");
    expect(PANEL).toContain("menuItems={items.map");
  });

  test("the field writes to a route that exists", () => {
    expect(existsSync(API_PATH)).toBe(true);
    const field = readFileSync(FIELD_PATH, "utf8");
    expect(field).toContain("/menu/items/${itemId}/pairings");
    const api = readFileSync(API_PATH, "utf8");
    for (const verb of ["GET", "POST", "DELETE"]) {
      expect(api).toContain(`export async function ${verb}(`);
    }
  });

  test("the route refuses a pairing that crosses venues", () => {
    // Without this an owner could point their dish at an item on someone
    // else's menu, and a guest would be shown a dish their kitchen has
    // never heard of.
    const api = readFileSync(API_PATH, "utf8");
    expect(api).toContain("INVALID_SUGGESTION");
    expect(api).toContain("SELF_PAIRING");
    expect(api).toContain("gate.venueId");
  });

  test("writing requires the menu-edit permission, reading doesn't", () => {
    const api = readFileSync(API_PATH, "utf8");
    const writes = api.split("export async function POST")[1] ?? "";
    expect(writes).toContain('"menu.edit"');
    const del = api.split("export async function DELETE")[1] ?? "";
    expect(del).toContain('"menu.edit"');
  });
});

describe("a guest actually sees one", () => {
  test("the guest page loads pairings", () => {
    expect(GUEST_PAGE).toContain("db.menuItemPairing.findMany");
    expect(GUEST_PAGE).toContain("pairings={pairings}");
  });

  test("the page scopes them to this venue", () => {
    const query = GUEST_PAGE.split("db.menuItemPairing.findMany")[1]?.slice(0, 300) ?? "";
    expect(query).toContain("venueId: resolved.venueId");
  });

  test("the guest home renders the suggestion", () => {
    expect(GUEST_HOME).toContain("<PairingSuggestion");
    expect(GUEST_HOME).toContain("suggestionFor(");
  });

  test("the suggestion is passed somewhere that renders it", () => {
    // It was possible to compute a suggestion, pass it as a prop, and
    // never place the prop in the tree — which is this bug wearing a
    // different hat.
    expect(GUEST_HOME).toContain("suggestion={");
    expect(GUEST_HOME).toContain("{suggestion}");
  });

  test("a waiting guest gets the pairing before a generic feature", () => {
    // Both are venue-authored, but one is about their table.
    const waiting = GUEST_HOME.split("const waiting = useMemo")[1]?.slice(0, 600) ?? "";
    expect(waiting).toContain("if (pairing)");
    expect(waiting.indexOf("if (pairing)")).toBeLessThan(waiting.indexOf("isFeatured"));
  });
});

describe("nothing about pairings is inferred", () => {
  test("no scoring, ranking or popularity maths anywhere in the library", () => {
    const lib = read("lib/pairings.ts");
    for (const smell of ["Math.random", "score(", "popularity", "affinity"]) {
      expect(lib).not.toContain(smell);
    }
  });

  test("the guest surface offers save, never add-to-order", () => {
    const card = read("components/guest/pairing-suggestion.tsx").toLowerCase();
    expect(card).not.toContain("add to");
    expect(card).not.toContain("order now");
    expect(card).toContain("save");
  });
});
