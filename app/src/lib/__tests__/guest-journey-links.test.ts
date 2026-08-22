/**
 * The guest journey has to actually connect.
 *
 * "Explore the menu" — the primary call to action of the whole guest
 * experience — shipped pointing at a URL the destination refused, so a
 * guest who scanned, read the welcome and tapped the one big button landed
 * on "That code didn't work". Every page worked in isolation; the LINK
 * between them didn't, which is exactly the kind of break a per-page test
 * can't see.
 *
 * The root cause was `?s=` meaning two different things: the entry and
 * home pages validate it against the table's QR token, while feedback
 * validated it against the session token. This pins the contract so the
 * three can't drift apart again.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const TABLE_DIR = join(import.meta.dir, "../../app/v/[slug]/t/[tableId]");
const read = (p: string) => readFileSync(join(TABLE_DIR, p), "utf8");

describe("every table-scoped page reads ?s= the same way", () => {
  test("entry, home and feedback all resolve through resolveGuestSession", () => {
    // One resolver means one meaning for the credential. Feedback used to
    // hand-roll its own comparison against a different token.
    for (const page of ["page.tsx", "home/page.tsx", "feedback/page.tsx"]) {
      expect(read(page)).toContain("resolveGuestSession");
    }
  });

  test("no page hand-rolls its own token comparison any more", () => {
    for (const page of ["page.tsx", "home/page.tsx", "feedback/page.tsx"]) {
      const src = read(page);
      expect(src).not.toContain("tokensEqual(session.sessionToken");
    }
  });
});

describe("links between guest pages carry the credential the destination wants", () => {
  test("the welcome passes through the ?s= it received, not the session token", () => {
    const src = read("page.tsx");
    // The bug: `?s=${resolved.sessionToken}` — a token /home rejects.
    expect(src).not.toMatch(/home\?s=\$\{encodeURIComponent\(resolved\.sessionToken\)/);
    expect(src).toMatch(/home\?s=\$\{encodeURIComponent\(searchParams\.s/);
  });

  test("the feedback link is built from the same ?s= too", () => {
    for (const page of ["page.tsx", "home/page.tsx"]) {
      const src = read(page);
      if (!src.includes("feedback?s=")) continue;
      expect(src).toMatch(/feedback\?s=\$\{encodeURIComponent\(searchParams\.s/);
    }
  });
});

describe("feedback is reachable at all", () => {
  test("something in the guest journey links to it", () => {
    // It shipped with a config flag and no entry point, so the whole
    // rating → tags → recovery → consent flow was dead code.
    const linked = ["page.tsx", "home/page.tsx"].some(p =>
      read(p).includes("feedback?s="),
    );
    expect(linked).toBe(true);
  });

  test("the offer is tied to asking for the check, not shown mid-meal", () => {
    const sheet = readFileSync(
      join(import.meta.dir, "../../components/guest/service-sheet.tsx"),
      "utf8",
    );
    // Spec: don't interrupt the meal. The check request is the one moment
    // the guest has told us they're finishing.
    expect(sheet).toMatch(/chosen\?\.type === "BILL" \? feedbackHref : undefined/);
  });
});
