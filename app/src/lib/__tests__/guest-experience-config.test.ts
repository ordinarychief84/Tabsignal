/**
 * Guest-experience flags.
 *
 * The important property is the default: everything ON. A venue that has
 * never opened the settings page must get the whole product, not an empty
 * shell it has to opt into. The one exception is the thank-you message,
 * because that one sends something.
 */

import { describe, expect, test } from "bun:test";
import {
  guestExperienceFrom,
  mergeGuestExperience,
  GUEST_EXPERIENCE_DEFAULTS,
  GUEST_EXPERIENCE_KEYS,
} from "../guest-experience";

describe("defaults", () => {
  test("a venue that never configured anything gets the full experience", () => {
    const config = guestExperienceFrom(null);
    for (const key of GUEST_EXPERIENCE_KEYS) {
      if (key === "thankYouMessage") continue;
      expect(config[key]).toBe(true);
    }
  });

  test("the only default-off flag is the one that sends a message", () => {
    const off = GUEST_EXPERIENCE_KEYS.filter(k => !GUEST_EXPERIENCE_DEFAULTS[k]);
    expect(off).toEqual(["thankYouMessage"]);
  });

  test("junk in the column doesn't break the guest page", () => {
    // enabledFeatures is free-form JSON that predates this feature.
    for (const junk of [undefined, null, "nonsense", 42, [], { unrelated: true }]) {
      expect(guestExperienceFrom(junk).welcome).toBe(true);
    }
  });

  test("a non-boolean value falls back to the default rather than being truthy", () => {
    const config = guestExperienceFrom({ guestExperience: { welcome: "no", specials: 0 } });
    expect(config.welcome).toBe(true);
    expect(config.specials).toBe(true);
  });
});

describe("reading a real config", () => {
  test("respects explicit false", () => {
    const config = guestExperienceFrom({ guestExperience: { specials: false, myPicks: false } });
    expect(config.specials).toBe(false);
    expect(config.myPicks).toBe(false);
    // Untouched flags keep their defaults.
    expect(config.welcome).toBe(true);
  });

  test("reads a flat object too, for configs written before the nesting", () => {
    expect(guestExperienceFrom({ welcome: false }).welcome).toBe(false);
  });
});

describe("merging an update", () => {
  test("preserves keys owned by other parts of the app", () => {
    const existing = { someOtherFeature: true, guestExperience: { welcome: true } };
    const merged = mergeGuestExperience(existing, { welcome: false });
    expect(merged.someOtherFeature).toBe(true);
    expect((merged.guestExperience as Record<string, boolean>).welcome).toBe(false);
  });

  test("a partial patch leaves everything else alone", () => {
    const merged = mergeGuestExperience(
      { guestExperience: { specials: false } },
      { myPicks: false },
    );
    const ge = merged.guestExperience as Record<string, boolean>;
    expect(ge.specials).toBe(false);
    expect(ge.myPicks).toBe(false);
    expect(ge.welcome).toBe(true);
  });

  test("ignores keys that aren't ours", () => {
    const merged = mergeGuestExperience({}, { evil: true } as never);
    expect((merged.guestExperience as Record<string, unknown>).evil).toBeUndefined();
  });
});
