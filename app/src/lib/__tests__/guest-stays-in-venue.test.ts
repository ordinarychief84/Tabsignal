/**
 * A guest belongs to the venue, not to TabCall.
 *
 * They came to a restaurant, someone handed them a code. They have no
 * relationship with us and no reason to end up on our marketing site — so
 * no guest surface may link to "/" or wear our name.
 *
 * This is a source-level guard rather than a rendering test because the
 * way it broke was structural: /v/ had no error boundary of its own, so
 * every notFound() fell through to the app-level 404, which offered
 * "← back to TabCall". Nothing under /v/ was wrong; the hole was what
 * WASN'T there. A test that only checked existing pages would have passed
 * while the bug shipped.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";

const GUEST_ROOT = join(import.meta.dir, "../../app/v");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const GUEST_FILES = walk(GUEST_ROOT);

describe("guest surfaces never route to TabCall", () => {
  test("no guest file links to the marketing landing page", () => {
    const offenders: string[] = [];
    for (const file of GUEST_FILES) {
      const src = readFileSync(file, "utf8");
      // href="/" exactly — the app's own root.
      if (/href=\{?["'`]\/["'`]/.test(src)) {
        offenders.push(file.replace(GUEST_ROOT, "v"));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no guest file offers to send them 'back to TabCall'", () => {
    const offenders: string[] = [];
    for (const file of GUEST_FILES) {
      const src = readFileSync(file, "utf8");
      // Comments are allowed to mention it — the boundaries explain why
      // they exist. Only rendered strings matter.
      const rendered = src
        .split("\n")
        .filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
        .join("\n");
      if (/back to TabCall/i.test(rendered)) {
        offenders.push(file.replace(GUEST_ROOT, "v"));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the guest area owns its dead ends", () => {
  test("has its own not-found boundary", () => {
    // Without this, notFound() bubbles to the app-level 404, which is
    // branded TabCall. That is the bug this suite exists for.
    expect(existsSync(join(GUEST_ROOT, "[slug]/not-found.tsx"))).toBe(true);
  });

  test("has its own error boundary", () => {
    expect(existsSync(join(GUEST_ROOT, "[slug]/error.tsx"))).toBe(true);
  });

  test("both keep the guest inside the venue", () => {
    for (const name of ["not-found.tsx", "error.tsx"]) {
      const src = readFileSync(join(GUEST_ROOT, "[slug]", name), "utf8");
      // Every link they offer is venue-scoped.
      const hrefs = [...src.matchAll(/href=\{?`([^`]*)`/g)].map(m => m[1]!);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href.startsWith("/v/")).toBe(true);
      }
    }
  });
});

describe("the browser tab shows the venue, not us", () => {
  test("the guest area sets an absolute title", () => {
    // The root layout applies a "%s | TabCall" template. Without
    // `absolute`, every guest page carries our marketing name in the tab,
    // in history, and in the preview card when the link is shared.
    const layout = readFileSync(join(GUEST_ROOT, "[slug]/layout.tsx"), "utf8");
    expect(layout).toContain("absolute");
    expect(layout).toContain("generateMetadata");
  });

  test("the venue's public page doesn't promise payment", () => {
    // TabCall stopped taking guest payments in #86; the POS settles the
    // bill. A title promising "Pay" would be the first thing a guest reads
    // and the first thing that turns out to be untrue.
    const page = readFileSync(join(GUEST_ROOT, "[slug]/page.tsx"), "utf8");
    const rendered = page
      .split("\n")
      .filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    expect(/title:.*\bPay\b/.test(rendered)).toBe(false);
  });
});
