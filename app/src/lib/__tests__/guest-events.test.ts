/**
 * Guest analytics events.
 *
 * The property worth defending here is not "the counter went up" — it's
 * that nothing which could identify a person can reach the table. A
 * phone number in an analytics row is a privacy incident that no amount
 * of later deletion undoes, and the usual way it happens is somebody
 * adding a helpful `meta` field months after the original author left.
 *
 * So: the schema has nowhere to put PII, sanitizeBatch discards
 * everything it isn't explicitly told to keep, and these tests assert
 * both — including that a payload actively trying to smuggle a name
 * through comes out the other side without it.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  GUEST_EVENTS,
  MAX_EVENTS_PER_BATCH,
  isGuestEvent,
  sanitizeBatch,
  DISCOVERY_EVENTS,
  SPECIAL_EVENTS,
  REVENUE_SAFE_LABELS,
} from "@/lib/guest-events";

describe("the event vocabulary is closed", () => {
  test("known names are accepted", () => {
    for (const e of GUEST_EVENTS) expect(isGuestEvent(e)).toBe(true);
  });

  test("anything else is rejected", () => {
    for (const bad of ["", "PICK_SAVED", "pick saved", null, 7, {}, []]) {
      expect(isGuestEvent(bad)).toBe(false);
    }
  });

  test("no duplicates", () => {
    // A duplicated name silently halves a metric when someone dedupes it.
    expect(new Set(GUEST_EVENTS).size).toBe(GUEST_EVENTS.length);
  });

  test("the derived groups only reference real events", () => {
    for (const e of [...DISCOVERY_EVENTS, ...SPECIAL_EVENTS]) {
      expect(isGuestEvent(e)).toBe(true);
    }
  });
});

describe("sanitizeBatch keeps only what may be stored", () => {
  test("passes a well-formed event through", () => {
    expect(sanitizeBatch([{ type: "pick_saved", menuItemId: "m1" }])).toEqual([
      { type: "pick_saved", menuItemId: "m1", promotionId: null },
    ]);
  });

  test("strips every field it wasn't told to keep", () => {
    // The smuggling case. Whatever a caller attaches, only three fields
    // survive — this is the lock that doesn't depend on anyone
    // remembering the rule at the call site.
    const dirty = [
      {
        type: "phone_provided",
        menuItemId: "m1",
        promotionId: null,
        phone: "+447700900000",
        name: "Alex Doe",
        email: "alex@example.com",
        ip: "203.0.113.4",
        deviceId: "abc-123",
        userAgent: "Mozilla/5.0",
        meta: { note: "sensitive" },
      },
    ];
    const [clean] = sanitizeBatch(dirty);
    expect(Object.keys(clean!).sort()).toEqual(["menuItemId", "promotionId", "type"]);
    const serialized = JSON.stringify(clean);
    for (const leak of ["447700900000", "Alex", "example.com", "203.0.113", "abc-123", "Mozilla"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  test("drops unknown event names without failing the batch", () => {
    // A phone on a cached older build shouldn't lose everything because
    // one name has since been retired.
    const out = sanitizeBatch([
      { type: "pick_saved" },
      { type: "some_retired_event" },
      { type: "menu_explored" },
    ]);
    expect(out.map(e => e.type)).toEqual(["pick_saved", "menu_explored"]);
  });

  test("caps a batch", () => {
    const many = Array.from({ length: 500 }, () => ({ type: "pick_saved" }));
    expect(sanitizeBatch(many).length).toBe(MAX_EVENTS_PER_BATCH);
  });

  test("survives rubbish", () => {
    for (const junk of [null, undefined, "nope", 42, {}, [null], [1, "x"], [[]]]) {
      expect(() => sanitizeBatch(junk)).not.toThrow();
    }
    expect(sanitizeBatch(null)).toEqual([]);
    expect(sanitizeBatch([{ noType: true }])).toEqual([]);
  });

  test("non-string ids become null rather than being stored", () => {
    const [clean] = sanitizeBatch([
      { type: "pick_saved", menuItemId: { $ne: null }, promotionId: 7 },
    ]);
    expect(clean!.menuItemId).toBeNull();
    expect(clean!.promotionId).toBeNull();
  });
});

describe("the schema itself cannot hold PII", () => {
  const schema = readFileSync(
    join(import.meta.dir, "../../../prisma/schema.prisma"),
    "utf8",
  );
  const model = schema.split("model GuestEvent {")[1]?.split("\n}")[0] ?? "";

  test("GuestEvent exists", () => {
    expect(model.length).toBeGreaterThan(0);
  });

  test("it has no column that could carry an identity", () => {
    // Structural, not aspirational. If someone adds `note String?` here
    // this fails before it can ship.
    const lower = model.toLowerCase();
    for (const forbidden of [
      "phone",
      "email",
      "name",
      "note",
      "ip ",
      "ipaddress",
      "useragent",
      "deviceid",
      "meta",
      "payload",
      "properties",
    ]) {
      expect(lower).not.toContain(forbidden);
    }
  });

  test("it carries only the dimensions analytics actually needs", () => {
    for (const field of ["venueId", "sessionId", "type", "menuItemId", "promotionId"]) {
      expect(model).toContain(field);
    }
  });
});

describe("venue-facing wording never claims revenue", () => {
  test("the safe labels talk about saves and views, not money", () => {
    for (const label of Object.values(REVENUE_SAFE_LABELS)) {
      const l = label.toLowerCase();
      for (const banned of ["revenue", "sales", "earned", "£", "$", "uplift", "roi"]) {
        expect(l).not.toContain(banned);
      }
    }
  });

  test("the analytics module makes no revenue claim about suggestions", () => {
    const src = readFileSync(join(import.meta.dir, "../guest-analytics.ts"), "utf8");
    const rendered = src
      .split("\n")
      .filter(l => {
        const t = l.trim();
        return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n")
      .toLowerCase();
    for (const banned of ["upsellrevenue", "revenuefrom", "attributedrevenue"]) {
      expect(rendered).not.toContain(banned);
    }
  });
});
