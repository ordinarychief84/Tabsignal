/**
 * The guest navigation is actually wired up.
 *
 * This file exists because of a failure this codebase keeps repeating:
 * building something real, and leaving nothing on screen that reaches it.
 * Menu tags shipped with no editor field. Server display names shipped
 * with no form. `service_recovery` fired into a screen that wasn't
 * listening. Each time, every unit test passed.
 *
 * So these are structural assertions about wiring rather than behaviour
 * assertions about functions. They ask: is the bar mounted, does the
 * service button exist, does the status card get rendered by the page
 * that owns it, and is the thing that made a refresh survivable actually
 * passed down from the server.
 *
 * The other bug pinned here was subtler and only showed up in a browser:
 * ServiceStatusCard takes its opening value through a prop that seeds
 * useState, and useState ignores a prop that changes later. Sending a
 * request updated the parent and changed nothing on screen — the card
 * stayed invisible, which is precisely the silence it was built to end.
 * The fix is a `key` that remounts it; the test makes sure the key
 * doesn't get tidied away by someone who doesn't know why it's there.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");

const HOME = readFileSync(
  join(ROOT, "app/v/[slug]/t/[tableId]/home/guest-home.tsx"),
  "utf8",
);
const HOME_PAGE = readFileSync(
  join(ROOT, "app/v/[slug]/t/[tableId]/home/page.tsx"),
  "utf8",
);
const NAV = readFileSync(join(ROOT, "components/guest/bottom-nav.tsx"), "utf8");

/**
 * Comments explain the rules; only rendered code should satisfy them.
 *
 * JSX comment blocks are stripped too. A note reading "this is a signal,
 * not a checkout" is the code being careful, and a naive scan for the
 * word "checkout" fails the file for saying the right thing.
 */
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

describe("the bottom bar is mounted, not merely written", () => {
  test("the guest home renders BottomGuestNav", () => {
    expect(code(HOME)).toContain("<BottomGuestNav");
  });

  test("all four navigation slots are passed to it", () => {
    const rendered = code(HOME);
    for (const label of ["For You", "Menu", "My Picks", "More"]) {
      expect(rendered).toContain(`label: "${label}"`);
    }
  });

  test("every slot the bar renders is a tab the page can actually show", () => {
    // A nav id with no matching `tab === "..."` branch is a button that
    // navigates to a blank screen.
    const rendered = code(HOME);
    for (const id of ["for-you", "menu", "picks", "more"]) {
      expect(rendered).toContain(`id: "${id}"`);
      expect(rendered).toContain(`tab === "${id}"`);
    }
  });

  test("the old sticky top tab strip is gone", () => {
    // Two navigations for the same five destinations is worse than one.
    expect(code(HOME)).not.toContain('className="sticky top-0 z-30');
  });

  test("the service button opens the sheet rather than sitting inert", () => {
    expect(code(HOME)).toContain("onService=");
    expect(code(HOME)).toContain("setServiceOpen(true)");
  });

  test("the sheet no longer carries a dock of its own", () => {
    // Both call sites had switched it off, which left a branch nobody
    // rendered. Two of the same control on one screen, with one covering
    // the other, is the state this prevents.
    const sheet = readFileSync(join(ROOT, "components/guest/service-sheet.tsx"), "utf8");
    expect(sheet).not.toContain("showDock");
  });

  test("the bar keeps clear of the iOS home indicator", () => {
    expect(NAV).toContain("env(safe-area-inset-bottom)");
  });

  test("the page reserves room for the bar", () => {
    // Without bottom padding the last row of a menu sits under the bar.
    expect(code(HOME)).toMatch(/min-h-\[100dvh\][^"]*pb-2[0-9]/);
  });

  test("active state is not carried by colour alone", () => {
    // A colour-only active state disappears for a colour-blind guest.
    expect(NAV).toContain("font-semibold");
    expect(NAV).toContain('aria-current');
  });

  test("touch targets clear the 44px minimum", () => {
    expect(NAV).toContain("min-h-[56px]");
  });
});

describe("the service status card is reachable and survives a refresh", () => {
  test("the guest home renders ServiceStatusCard", () => {
    expect(code(HOME)).toContain("<ServiceStatusCard");
  });

  test("it is remounted when the request changes identity", () => {
    // `initial` seeds useState, and useState ignores a later prop change.
    // Without this key the card stays invisible after sending — the exact
    // silence it exists to end. Verified broken in a browser before the
    // key was added; do not remove it.
    expect(code(HOME)).toContain("key={activeRequest?.id ?? \"none\"}");
  });

  test("the server resolves the open request and passes it down", () => {
    // This is what makes a mid-wait refresh survivable: the page asks the
    // database whether this session has an open request rather than
    // relying on React state that a reload throws away.
    const page = code(HOME_PAGE);
    expect(page).toContain("db.request.findFirst");
    expect(page).toContain("activeRequest={");
    expect(page).toMatch(
      /status:\s*\{\s*in:\s*\["PENDING",\s*"ACKNOWLEDGED",\s*"ON_MY_WAY",\s*"ESCALATED"\]/,
    );
  });

  test("the sheet tells the page when a request actually lands", () => {
    // Otherwise the card waits for the next poll and the guest presses a
    // button that appears to do nothing for five seconds.
    expect(code(HOME)).toContain("onSent=");
  });

  test("'while you wait' is rendered inside the status card, never over it", () => {
    const rendered = code(HOME);
    const cardAt = rendered.indexOf("<ServiceStatusCard");
    const waitAt = rendered.indexOf("<WaitingRecommendation");
    const closeAt = rendered.indexOf("</ServiceStatusCard>");
    expect(cardAt).toBeGreaterThan(-1);
    expect(waitAt).toBeGreaterThan(cardAt);
    expect(waitAt).toBeLessThan(closeAt);
  });
});

describe("nothing on the guest home orders or charges anything", () => {
  test("no cart, no checkout, no payment language", () => {
    const rendered = code(HOME).toLowerCase();
    for (const banned of ["add to cart", "checkout", "pay now", "pay bill"]) {
      expect(rendered).not.toContain(banned);
    }
  });

  test("'ready to order' raises a request and posts nothing else", () => {
    // The only endpoint this button may reach is the shared request API.
    const rendered = code(HOME);
    expect(rendered).toContain('fetch("/api/requests"');
    expect(rendered).not.toContain("/api/v/${props.venueSlug}/orders");
  });
});
