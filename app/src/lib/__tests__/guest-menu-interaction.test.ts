/**
 * The menu is the screen a guest spends the most time on.
 *
 * It shipped with one interactive element per row — a small, unlabelled
 * star — and nothing else. The row itself was inert, so a description
 * longer than two lines could not be read at all, and a menu with six
 * categories meant scrolling past every cocktail to reach the food.
 *
 * These are source-level checks because the failures are structural:
 * a control that isn't there, a row that isn't a button, padding that
 * doesn't clear a fixed bar. A render test would pass on all of them.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const HOME = readFileSync(
  join(import.meta.dir, "../../app/v/[slug]/t/[tableId]/home/guest-home.tsx"),
  "utf8",
);
const SHEET_PATH = join(import.meta.dir, "../../components/guest/item-sheet.tsx");
describe("a guest can open a dish", () => {
  test("the item sheet exists", () => {
    expect(existsSync(SHEET_PATH)).toBe(true);
  });

  test("the row itself is the control, not just the star", () => {
    // Previously the only <button> in a row was the save toggle, so
    // tapping the name did nothing.
    expect(HOME).toContain("onOpen");
    expect(HOME).toMatch(/onClick=\{onOpen\}/);
  });

  test("the sheet shows the description in full, not clipped", () => {
    const sheet = readFileSync(SHEET_PATH, "utf8");
    // The list clamps to one line; the sheet must not.
    expect(sheet).not.toContain("line-clamp");
    expect(sheet).toContain("item.description");
  });

  test("the sheet says what saving does and does not do", () => {
    const sheet = readFileSync(SHEET_PATH, "utf8");
    // My Picks is a shortlist, not an order. A guest tapping a big dark
    // button on a restaurant menu will assume it orders unless told.
    expect(sheet).toMatch(/doesn&rsquo;t place an order|doesn't place an order/);
  });

  test("it locks the list behind it, then restores scrolling", () => {
    const sheet = readFileSync(SHEET_PATH, "utf8");
    expect(sheet).toContain('document.body.style.overflow = "hidden"');
    expect(sheet).toContain("document.body.style.overflow = prev");
  });
});

describe("the save control explains itself", () => {
  test("it carries a visible label, not just a star", () => {
    // An unexplained ☆ on a restaurant menu reads as a rating.
    expect(HOME).toMatch(/\{saved \? "Saved" : "Save"\}/);
  });

  test("and still carries an accessible label naming the item", () => {
    expect(HOME).toMatch(/aria-label=\{saved \? `Remove \$\{item\.name\}/);
  });
});

describe("a long menu is navigable", () => {
  test("categories get a jump strip", () => {
    expect(HOME).toContain("scrollIntoView");
    expect(HOME).toMatch(/#cat-\$\{group\.id\}/);
  });

  test("the strip only appears when there's more than one category", () => {
    // One category doesn't need navigating.
    expect(HOME).toMatch(/grouped\.length > 1 \?/);
  });

  test("sections offset for the sticky chrome above them", () => {
    // Without scroll-mt the jumped-to heading lands under the tab bar.
    expect(HOME).toContain("scroll-mt-");
  });
});

describe("the bottom bar doesn't eat the last row", () => {
  test("the page reserves room below the fold", () => {
    // Was pb-36, sized for a full-width docked pill plus its scrim. The
    // bar that replaced it is 64px tall, so pb-28 clears it with room to
    // spare — the number changed because the furniture did.
    expect(HOME).toMatch(/pb-28/);
  });

  test("the toast clears the dock", () => {
    expect(HOME).toMatch(/bottom-\[calc\(5\.5rem/);
  });
});
