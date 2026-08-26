/**
 * The menu's shape, derived from a real bar's ordering page.
 *
 * The reference has eleven drink categories under one "Bar" heading and
 * fifty-two items in a single one of them. TabCall rendered a horizontal
 * chip strip, which works at four categories and hides the last six at
 * eleven — a guest hunting for the wine list scrolls the whole cocktail
 * section instead, and puts the phone down.
 *
 * So: a group level above category, a browse sheet with counts, and rows
 * that read like a menu rather than a list.
 *
 * These are structural assertions rather than render tests, because the
 * failure mode here is a level of hierarchy silently not reaching the
 * guest — the same "built but unreachable" shape this codebase keeps
 * hitting.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const HOME = read("app/v/[slug]/t/[tableId]/home/guest-home.tsx");
const PAGE = read("app/v/[slug]/t/[tableId]/home/page.tsx");
const BROWSER = read("components/guest/menu-browser.tsx");
const ADMIN_PANEL = read("app/admin/v/[slug]/menu/menu-panel.tsx");
const ADMIN_PAGE = read("app/admin/v/[slug]/menu/page.tsx");
const CAT_ROUTE = read("app/api/admin/v/[slug]/menu/categories/[id]/route.ts");
const SCHEMA = readFileSync(join(ROOT, "../prisma/schema.prisma"), "utf8");

/** Comments explain the rules; only rendered code should satisfy them. */
function code(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .split("\n")
    .filter(l => {
      const t = l.trim();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("the group level reaches the guest", () => {
  test("the column exists and is nullable", () => {
    // Nullable so every existing category keeps working and simply
    // renders without a heading.
    const model = SCHEMA.split("model MenuCategory {")[1]?.split("\n}")[0] ?? "";
    expect(model).toContain("groupName String?");
  });

  test("the guest page selects it and orders by it", () => {
    // Selecting it but not ordering by it would scatter a venue's bar
    // categories through its food ones.
    expect(PAGE).toContain("groupName: true");
    expect(PAGE).toContain('{ groupName: "asc" }');
  });

  test("the guest menu renders GROUP · CATEGORY", () => {
    expect(code(HOME)).toContain("section.groupName ? `${section.groupName} · ` : \"\"");
  });

  test("an ungrouped category renders no separator", () => {
    // " · Cocktails" with a leading dot is the tell that a null slipped
    // through as an empty string.
    const heading = code(HOME).split("section.groupName ?")[1]?.slice(0, 80) ?? "";
    expect(heading).toContain('""');
  });
});

describe("a venue can actually set a group", () => {
  test("the category API accepts it", () => {
    expect(CAT_ROUTE).toContain("groupName");
  });

  test("empty is stored as null, not as a blank heading", () => {
    // Otherwise the guest reads " · Cocktails".
    expect(CAT_ROUTE).toContain('parsed.groupName?.trim() || null');
  });

  test("the editor exposes a field for it", () => {
    // The whole level is dead weight if nobody can set it — this repo
    // has shipped that shape five times.
    expect(code(ADMIN_PANEL)).toContain("Grouped under");
    expect(code(ADMIN_PANEL)).toContain("namingCategory.group");
  });

  test("existing groups are offered back, so casing doesn't fork", () => {
    // "Bar", "bar" and "BAR" as three separate headings is the obvious
    // way this degrades over a year of edits.
    expect(code(ADMIN_PANEL)).toContain("datalist");
  });

  test("the admin page loads it, or the field would always look empty", () => {
    expect(ADMIN_PAGE).toContain("groupName");
  });
});

describe("the browse sheet", () => {
  test("it is mounted by the menu, not merely written", () => {
    expect(code(HOME)).toContain("<MenuBrowser");
  });

  test("it shows a count per category", () => {
    // "Single Liquor 52" sets an expectation before a guest commits a
    // tap. A chip label cannot.
    expect(BROWSER).toContain("c.count");
    expect(code(HOME)).toContain("count: s.items.length");
  });

  test("the current category is marked by more than colour", () => {
    expect(BROWSER).toContain('aria-current');
    expect(BROWSER).toContain("font-semibold");
  });

  test("it locks the page behind it while open", () => {
    // Two scroll contexts fighting is how a full-height sheet on a phone
    // ends up scrolling the wrong thing.
    expect(BROWSER).toContain('document.body.style.overflow');
  });

  test("escape closes it", () => {
    expect(BROWSER).toContain('e.key === "Escape"');
  });

  test("a venue with no groups gets a flat list, not an empty heading", () => {
    // group.name is null for ungrouped categories and the heading is
    // skipped entirely.
    expect(BROWSER).toContain("group.name ? (");
  });
});

describe("the row reads like a menu", () => {
  test("text comes before the image in the DOM", () => {
    // Both for reading order and for screen readers: the name and price
    // are the content; the photo confirms.
    const row = code(HOME).split("function ItemRow(")[1] ?? "";
    const price = row.indexOf("priceCents");
    const img = row.indexOf("item.imageUrl ? (");
    expect(price).toBeGreaterThan(-1);
    expect(img).toBeGreaterThan(price);
  });

  test("the description is not clamped", () => {
    // A cocktail's description IS the sell. "Absolut Citron, lemon
    // juice, triple sec" cut after four words tells a guest nothing.
    const row = code(HOME).split("function ItemRow(")[1] ?? "";
    expect(row).not.toContain("line-clamp");
  });

  test("no placeholder box when there is no photo", () => {
    // With the image on the right, an item without one just lets its
    // text run wider — no ragged edge, and no empty box pretending to
    // be content.
    const row = code(HOME).split("function ItemRow(")[1] ?? "";
    const imgBlock = row.split("item.imageUrl ? (")[1]?.split(") : null}")[0] ?? "";
    expect(imgBlock).toContain("<img");
    expect(row).toContain(") : null}");
  });
});

describe("the label says where the guest actually is", () => {
  test("it is driven by what's on screen, not by the last tap", () => {
    expect(code(HOME)).toContain("IntersectionObserver");
  });

  test("the bottom of the page resolves to the last section", () => {
    // The last sections can never reach the band near the top — there is
    // no scroll left to give them. Without this a guest who taps the
    // final category watches the bar name a different one.
    const body = code(HOME);
    expect(body).toContain("document.body.scrollHeight");
    expect(body).toContain("sections[sections.length - 1]");
  });

  test("a scroll listener backs the observer up", () => {
    // Reaching the bottom often crosses no boundary at all, so the
    // observer alone never fires for that case.
    expect(code(HOME)).toContain('window.addEventListener("scroll"');
  });
});
