/**
 * Staff asking each other for something.
 *
 * §32 asks for operational communication and says in the same breath not
 * to build Slack inside TabCall. Those pull against each other, and the
 * way to satisfy both is to make composing IMPOSSIBLE rather than
 * discouraged — so the property most worth defending here is a negative
 * one: there is no message body anywhere in this feature, and no way to
 * add one without the schema changing.
 *
 * The other one is routing. "Need a manager" broadcast to the whole
 * floor makes three servers look up and none of them able to help; but a
 * manager ask that reaches nobody because none is on shift is the same
 * failure as a guest request reaching nobody.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  PING_ACTION_HINT,
  PING_ACTION_LABEL,
  PING_VISIBLE_MS,
  STAFF_PING_KINDS,
  isStaffPingKind,
  pingSentence,
  recipientsFor,
  type StaffPingKind,
} from "@/lib/staff/ping";

const ROUTE = readFileSync(
  join(import.meta.dir, "../../app/api/staff/ping/route.ts"),
  "utf8",
);
const SCHEMA = readFileSync(join(import.meta.dir, "../../../prisma/schema.prisma"), "utf8");

describe("this cannot become a chat product", () => {
  test("the model has nowhere to put a message", () => {
    // Structural, not aspirational. If somebody adds `body String?` to
    // make it "a bit more useful", this fails before it ships.
    const model = SCHEMA.split("model StaffPing {")[1]?.split("\n}")[0] ?? "";
    expect(model.length).toBeGreaterThan(0);

    // Field NAMES only. A substring scan trips over `answeredById`,
    // which contains "body" and is entirely innocent, and stripping
    // comments matters too — the ones here explain what isn't stored.
    const fieldNames = model
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map(l => l.split(/\s+/)[0] ?? "")
      .map(n => n.toLowerCase());

    for (const forbidden of ["body", "message", "text", "note", "content", "reply"]) {
      expect(fieldNames).not.toContain(forbidden);
    }
  });

  test("the route accepts only a kind and a table", () => {
    const create = ROUTE.split("const CreateBody")[1]?.split("});")[0] ?? "";
    expect(create).toContain("kind");
    expect(create).toContain("tableId");
    for (const forbidden of ["body", "message", "text", "note"]) {
      expect(create.toLowerCase()).not.toContain(forbidden);
    }
  });

  test("the sentence is composed from a fixed vocabulary, never stored", () => {
    // Text built at read time can improve without a migration, and can
    // never carry something somebody typed.
    expect(ROUTE).toContain("pingSentence(");
  });
});

describe("the sentence everyone reads", () => {
  test("names the person and the table", () => {
    expect(pingSentence({ kind: "NEED_HAND", fromName: "Maya", tableLabel: "T4" })).toBe(
      "Maya needs a hand at T4",
    );
    expect(pingSentence({ kind: "NEED_MANAGER", fromName: "Sam", tableLabel: "12" })).toBe(
      "Sam needs a manager at 12",
    );
  });

  test("reads properly with no table", () => {
    // "Maya needs a hand at " would be a bug visible to everyone.
    // "Maya needs cover" is fine — that one reads as a complete
    // sentence without a table, which is the point of checking each.
    for (const kind of STAFF_PING_KINDS) {
      const line = pingSentence({ kind, fromName: "Maya", tableLabel: null });
      expect(line).not.toMatch(/\bat\s*$/);
      expect(line).not.toMatch(/\s$/);
      expect(line.startsWith("Maya")).toBe(true);
    }
  });

  test("'need cover' says which table it is asking about", () => {
    // "Maya needs cover at 11" is ambiguous — cover for her, or for the
    // table? The table IS the ask here.
    expect(pingSentence({ kind: "NEED_COVER", fromName: "Maya", tableLabel: "11" })).toBe(
      "Maya needs someone to cover 11",
    );
  });

  test("every kind produces a distinct sentence", () => {
    const lines = STAFF_PING_KINDS.map(k =>
      pingSentence({ kind: k, fromName: "Maya", tableLabel: "T1" }),
    );
    expect(new Set(lines).size).toBe(STAFF_PING_KINDS.length);
  });

  test("every kind has a label and a hint that says what it's for", () => {
    for (const kind of STAFF_PING_KINDS) {
      expect(PING_ACTION_LABEL[kind].length).toBeGreaterThan(0);
      expect(PING_ACTION_HINT[kind].length).toBeGreaterThan(0);
    }
  });
});

describe("routing", () => {
  const staff = [
    { id: "server1", role: "SERVER" },
    { id: "server2", role: "SERVER" },
    { id: "mgr", role: "MANAGER" },
    { id: "owner", role: "OWNER" },
  ];

  test("a hand goes to everyone but the sender", () => {
    const to = recipientsFor("NEED_HAND", staff, "server1");
    expect(to.sort()).toEqual(["mgr", "owner", "server2"]);
  });

  test("a manager ask goes only to managers and owners", () => {
    // Broadcasting it makes three servers look up and none of them able
    // to help.
    expect(recipientsFor("NEED_MANAGER", staff, "server1").sort()).toEqual(["mgr", "owner"]);
  });

  test("a manager ask with no manager on falls back to the floor", () => {
    // A ping that reaches nobody is the same failure as a guest request
    // that reaches nobody.
    const serversOnly = [
      { id: "server1", role: "SERVER" },
      { id: "server2", role: "SERVER" },
    ];
    expect(recipientsFor("NEED_MANAGER", serversOnly, "server1")).toEqual(["server2"]);
  });

  test("the sender is never a recipient of their own ask", () => {
    for (const kind of STAFF_PING_KINDS) {
      for (const senderId of staff.map(s => s.id)) {
        expect(recipientsFor(kind, staff, senderId)).not.toContain(senderId);
      }
    }
  });

  test("a lone member of staff pings nobody rather than themselves", () => {
    const alone = [{ id: "server1", role: "SERVER" }];
    for (const kind of STAFF_PING_KINDS) {
      expect(recipientsFor(kind, alone, "server1")).toEqual([]);
    }
  });
});

describe("pings expire rather than accumulating", () => {
  test("the window is minutes, not hours", () => {
    // A "need a hand" from forty minutes ago is not a thing anybody is
    // still going to answer, and a list of stale asks is how a floor
    // learns to ignore the list.
    expect(PING_VISIBLE_MS).toBeGreaterThan(60_000);
    expect(PING_VISIBLE_MS).toBeLessThanOrEqual(15 * 60_000);
  });

  test("the read applies the window and excludes answered ones", () => {
    const get = ROUTE.split("export async function GET")[1]?.split("export ")[0] ?? "";
    expect(get).toContain("PING_VISIBLE_MS");
    expect(get).toContain("answeredAt: null");
  });
});

describe("guards", () => {
  test("kinds are validated, not trusted", () => {
    for (const k of STAFF_PING_KINDS) expect(isStaffPingKind(k)).toBe(true);
    for (const bad of ["", "NEED_COFFEE", null, 3, {}]) {
      expect(isStaffPingKind(bad)).toBe(false);
    }
  });

  test("every venue scope comes from the session, never the request", () => {
    // Nothing a caller sends may widen which venue they reach.
    expect(ROUTE).toContain("venueId: session.venueId");
    expect(ROUTE).not.toMatch(/venueId:\s*parsed\./);
  });

  test("a table from another venue can't be attached", () => {
    expect(ROUTE).toContain("table.venueId !== session.venueId");
    expect(ROUTE).toContain("INVALID_TABLE");
  });

  test("answering is a compare-and-swap, so two people don't both take it", () => {
    const patch = ROUTE.split("export async function PATCH")[1] ?? "";
    expect(patch).toContain("answeredAt: null");
    expect(patch).toContain("ALREADY_ANSWERED");
  });

  test("raising a ping is rate limited, because it buzzes other phones", () => {
    expect(ROUTE).toContain("rateLimitAsync");
  });

  test("a suspended account can't ping the floor", () => {
    expect(ROUTE).toContain('sender.status !== "ACTIVE"');
  });

  test("only the floor name is broadcast, never the legal one", () => {
    // A ping can land on a shared tablet.
    expect(ROUTE).toContain("sender.displayName ??");
    expect(ROUTE).toContain("p.fromStaff.displayName ??");
  });
});
