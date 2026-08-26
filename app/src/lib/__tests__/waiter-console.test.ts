/**
 * The waiter console's data layer.
 *
 * Two things are being defended here.
 *
 * PRIVACY. A service screen shows who is waiting, where, for what and
 * for how long. It does not show a guest's phone number, their marketing
 * consent, their campaign membership, or what they said about a previous
 * visit — a server does not need any of that to bring water, and a
 * shared service tablet is the worst possible place to keep it. The
 * tests read the module's own queries and fail if a forbidden field
 * appears in one, because the usual way this leaks is somebody adding a
 * "helpful" field to a select months later.
 *
 * HONESTY IN THE NUMBERS. A response time of "0:00" when nothing has
 * happened reads as perfect service. A rating of 5.0 from one guest
 * reads like 5.0 from forty. Both are the kind of number a server draws
 * a conclusion from mid-shift, so absent data must render as absent.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { formatWait } from "@/lib/wait-format";

const SRC = readFileSync(join(import.meta.dir, "../waiter-console.ts"), "utf8");
const CONTEXT_ROUTE = readFileSync(
  join(import.meta.dir, "../../app/api/venue/[venueId]/tables/[tableId]/context/route.ts"),
  "utf8",
);
const FLOOR_ROUTE = readFileSync(
  join(import.meta.dir, "../../app/api/venue/[venueId]/floor/route.ts"),
  "utf8",
);

/** Comments explain the rules; only real code should satisfy them. */
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

describe("nothing private reaches a service screen", () => {
  const FORBIDDEN = [
    "phone",
    "marketingConsent",
    "guestContact",
    "campaign",
    "guestProfile",
    "consent",
    "email",
    "passwordHash",
  ];

  test("the console queries select no guest identity", () => {
    const src = code(SRC);
    for (const field of FORBIDDEN) {
      expect(src.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });

  test("the table-context route selects no guest identity", () => {
    // This is the one a server opens standing at a table, with the table
    // able to see the screen.
    const src = code(CONTEXT_ROUTE);
    for (const field of FORBIDDEN) {
      expect(src.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });

  test("nothing about money appears anywhere", () => {
    // TabCall doesn't process payments and has no bill to show. A total
    // on a service screen would be inventing one.
    for (const src of [code(SRC), code(CONTEXT_ROUTE)]) {
      const l = src.toLowerCase();
      for (const banned of ["amountcents", "totalcents", "paymentstatus", "cardlast4"]) {
        expect(l).not.toContain(banned);
      }
    }
  });

  test("staff are surfaced by their floor name, never their legal one", () => {
    // `name` can be a legal name. displayName is what they go by.
    expect(CONTEXT_ROUTE).toContain("displayName");
    expect(CONTEXT_ROUTE).toContain("a.staff.displayName ?? a.staff.name");
  });

  test("table picks come back as counts, never as who saved them", () => {
    // Split on the next export, not the next brace — the parameter
    // destructure closes a brace before the body even starts.
    const picks = SRC.split("export async function tablePicks")[1]?.split("\nexport ")[0] ?? "";
    expect(picks.length).toBeGreaterThan(0);
    expect(picks).not.toContain("guestSessionId");
    expect(picks).toContain("quantity");
  });
});

describe("venue isolation is enforced server-side", () => {
  test("both routes compare the session's venue to the requested one", () => {
    for (const src of [CONTEXT_ROUTE, FLOOR_ROUTE]) {
      expect(src).toContain("session.venueId !== ctx.params.venueId");
      expect(src).toContain('{ error: "FORBIDDEN" }');
    }
  });

  test("the table route re-checks the table's own venue after loading it", () => {
    // The session check alone isn't enough: a table id from another
    // venue must not resolve just because the caller is signed in
    // somewhere.
    expect(CONTEXT_ROUTE).toContain("table.venueId !== ctx.params.venueId");
  });

  test("the floor route derives assignments from the session, not the request", () => {
    // Nothing a caller sends may widen what they see.
    expect(FLOOR_ROUTE).toContain("session.staffId");
    expect(FLOOR_ROUTE).toContain("session.venueId");
  });
});

describe("open requests include every open state", () => {
  test("both modules count ON_MY_WAY as open", () => {
    // A new enum member that a query forgets silently drops rows — a
    // table with somebody walking to it would show as clear.
    for (const src of [SRC, CONTEXT_ROUTE]) {
      const matches = src.match(/"PENDING", "ACKNOWLEDGED", "ON_MY_WAY", "ESCALATED"/g) ?? [];
      expect(matches.length).toBeGreaterThan(0);
    }
    expect(SRC).not.toMatch(/\["PENDING", "ACKNOWLEDGED", "ESCALATED"\]/);
  });
});

describe("the numbers are honest", () => {
  test("response time is a median, not a mean", () => {
    // One request left unacknowledged over a break would drag a mean
    // into uselessness; the typical wait is what somebody can act on.
    const fn = SRC.split("export async function shiftSummary")[1]?.split("\nexport ")[0] ?? "";
    expect(fn).toContain("waits.length % 2");
    expect(fn).not.toMatch(/reduce\([^)]*\)\s*\/\s*waits\.length/);
  });

  test("absent data returns null rather than zero", () => {
    const fn = SRC.split("export async function shiftSummary")[1]?.split("\nexport ")[0] ?? "";
    expect(fn).toContain("waits.length === 0\n      ? null");
    expect(fn).toContain("ratings.length === 0\n      ? null");
  });

  test("the rating carries its own denominator", () => {
    // 5.0 from one guest is not 5.0 from forty, and a server reading the
    // first as the second draws the wrong conclusion about their night.
    expect(SRC).toContain("ratingCount");
  });
});

describe("formatWait", () => {
  test("mm:ss below an hour", () => {
    expect(formatWait(0)).toBe("0:00");
    expect(formatWait(9)).toBe("0:09");
    expect(formatWait(62)).toBe("1:02");
    expect(formatWait(225)).toBe("3:45");
    expect(formatWait(3599)).toBe("59:59");
  });

  test("h:mm once it's embarrassing", () => {
    expect(formatWait(3600)).toBe("1:00");
    expect(formatWait(3660)).toBe("1:01");
  });

  test("seconds always pad, so timers don't jitter in width", () => {
    // "1:5" would shift every digit beside it once a second.
    for (let s = 0; s < 60; s++) {
      expect(formatWait(60 + s).split(":")[1]!.length).toBe(2);
    }
  });

  test("nonsense degrades instead of rendering NaN", () => {
    expect(formatWait(-5)).toBe("0:00");
    expect(formatWait(Number.NaN)).toBe("0:00");
    expect(formatWait(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("table state ranking", () => {
  test("unclaimed-and-old outranks unclaimed, which outranks in-progress", () => {
    // The order a waiter's eye should travel. Encoded as a RANK map so
    // it can't drift from the visual treatment.
    const rank = SRC.split("const RANK")[1]?.split("}")[0] ?? "";
    const order = ["needs_attention", "new_request", "in_progress", "clear"];
    let last = -1;
    for (const key of order) {
      const idx = rank.indexOf(key);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  test("a table is only 'needs attention' when nobody has claimed it", () => {
    // Somebody walking over is not a table that needs attention, however
    // long the guest has been waiting — flagging it sends a second
    // server to a table that already has one coming.
    const fn = SRC.split("export async function waiterTables")[1]?.split("\nexport ")[0] ?? "";
    expect(fn).toContain("agg.oldest >= thresholds.attentionSeconds && agg.unclaimed > 0");
  });

  test("the waiter's own tables sort first", () => {
    const fn = SRC.split("export async function waiterTables")[1]?.split("\nexport ")[0] ?? "";
    expect(fn).toContain("Number(b.mine) - Number(a.mine)");
  });
});
