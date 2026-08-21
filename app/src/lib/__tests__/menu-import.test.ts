/**
 * Bulk menu import.
 *
 * The rule that matters: a price we can't read is REPORTED, never
 * guessed. Every other decision here is convenience — that one puts
 * numbers in front of paying guests, and a wrong price is worse for a
 * venue than an import that made them fix one line.
 */

import { describe, expect, test } from "bun:test";
import { parseMenuText, parsePrice } from "../menu-import";

describe("parsePrice", () => {
  test("reads the shapes people actually paste", () => {
    expect(parsePrice("14")).toBe(1400);
    expect(parsePrice("14.5")).toBe(1450);
    expect(parsePrice("14.00")).toBe(1400);
    expect(parsePrice("$14.00")).toBe(1400);
    expect(parsePrice("£14")).toBe(1400);
    expect(parsePrice("  14.99  ")).toBe(1499);
  });

  test("handles a European decimal comma", () => {
    expect(parsePrice("14,50")).toBe(1450);
  });

  test("strips thousands separators without inventing a value", () => {
    expect(parsePrice("1,250.00")).toBe(125000);
  });

  test("refuses anything it can't read rather than guessing", () => {
    // "14.00.00" as $14 would be a wrong price on a real menu.
    for (const bad of ["", "market price", "14.00.00", "abc", "-5", "1e5"]) {
      expect(parsePrice(bad)).toBeNull();
    }
  });
});

describe("parseMenuText", () => {
  test("reads a comma-separated menu", () => {
    const { items, errors } = parseMenuText("Margherita, 14.00, Classic tomato and basil");
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({
      name: "Margherita",
      priceCents: 1400,
      description: "Classic tomato and basil",
    });
  });

  test("reads pipes and tabs too, because clipboards vary", () => {
    expect(parseMenuText("Margherita | 14 | Tomato").items[0]!.priceCents).toBe(1400);
    expect(parseMenuText("Margherita\t14\tTomato").items[0]!.priceCents).toBe(1400);
  });

  test("headings become categories and carry down the list", () => {
    const { items, categories } = parseMenuText(
      ["## Pizza", "Margherita, 14", "Marinara, 12", "## Drinks", "Negroni, 15"].join("\n"),
    );
    expect(categories).toEqual(["Pizza", "Drinks"]);
    expect(items.map(i => i.category)).toEqual(["Pizza", "Pizza", "Drinks"]);
  });

  test("recognises the other heading shapes", () => {
    expect(parseMenuText("[Starters]\nOlives, 6").items[0]!.category).toBe("Starters");
    expect(parseMenuText("Starters:\nOlives, 6").items[0]!.category).toBe("Starters");
  });

  test("a line with a price is an item, not a heading", () => {
    // "Soup of the day: 8" must not be read as a category.
    const { items } = parseMenuText("Soup of the day: 8");
    expect(items.length).toBe(1);
  });

  test("reports unreadable rows with the line number, and imports the rest", () => {
    const { items, errors } = parseMenuText(
      ["Margherita, 14.00", "Mystery Dish, market price", "Negroni, 15"].join("\n"),
    );
    // The good rows still come through — one bad line doesn't sink an import.
    expect(items.map(i => i.name)).toEqual(["Margherita", "Negroni"]);
    expect(errors.length).toBe(1);
    expect(errors[0]!.line).toBe(2);
    expect(errors[0]!.text).toContain("Mystery Dish");
  });

  test("a row with no price at all is reported, not defaulted to zero", () => {
    const { items, errors } = parseMenuText("Just A Name");
    expect(items).toEqual([]);
    expect(errors[0]!.reason).toContain("No price");
  });

  test("finds the price even with a leading blank column", () => {
    // Pasted spreadsheets often carry one.
    const { items } = parseMenuText("Margherita\t\t14.00\tTomato");
    expect(items[0]!.priceCents).toBe(1400);
  });

  test("short trailing fields become tags, normalised", () => {
    const { items } = parseMenuText("Salad, 9, Light and fresh with lemon dressing, Light, LIGHT");
    expect(items[0]!.description).toBe("Light and fresh with lemon dressing");
    // Lowercased and de-duplicated, so the guest matcher sees one tag.
    expect(items[0]!.tags).toEqual(["light"]);
  });

  test("reads a menu written without separators", () => {
    // "Margherita 14.00" and dot leaders are how printed menus look.
    expect(parseMenuText("Margherita 14.00").items[0]).toMatchObject({
      name: "Margherita",
      priceCents: 1400,
    });
    expect(parseMenuText("Olives ......... 6").items[0]).toMatchObject({
      name: "Olives",
      priceCents: 600,
    });
    expect(parseMenuText("Soup of the day: 8").items[0]).toMatchObject({
      name: "Soup of the day",
      priceCents: 800,
    });
  });

  test("never invents a price from something that isn't one", () => {
    // Regression: "1e5" once stripped to "15" and imported as $15.00.
    for (const bad of ["Dish 1e5", "Dish 14.00 each", "Dish market price"]) {
      const { items, errors } = parseMenuText(bad);
      expect(items).toEqual([]);
      expect(errors.length).toBe(1);
    }
  });

  test("ignores blank lines", () => {
    const { items, errors } = parseMenuText("\n\nMargherita, 14\n\n\n");
    expect(items.length).toBe(1);
    expect(errors).toEqual([]);
  });

  test("an empty paste yields nothing rather than throwing", () => {
    expect(parseMenuText("")).toEqual({ items: [], errors: [], categories: [] });
  });
});
