/**
 * Tests for the pure onboarding wizard helpers.
 *
 * These cover the routing rules (where the user lands when they reopen
 * the wizard), the JSON shape coercion (corrupted state must never
 * throw), step recording / advancement, and the "is this venue done?"
 * check the dashboard uses for the resume banner.
 */

import { describe, expect, test } from "bun:test";
import {
  INITIAL_STATE,
  STEPS,
  TOTAL_STEPS,
  isOnboardingComplete,
  pickInitialStep,
  progressPercent,
  readState,
  recordStepComplete,
  stepByNumber,
  type VenueSnapshot,
} from "../onboarding/wizard-state";

function snap(overrides: Partial<VenueSnapshot> = {}): VenueSnapshot {
  return {
    zipCode: "77002",
    brandColor: "#232130",
    logoUrl: null,
    welcomeMessage: "Welcome",
    venueType: "restaurant",
    tableCount: 6,
    staffCount: 1,
    solo: false,
    state: null,
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe("STEPS", () => {
  test("five steps in stable numeric order", () => {
    expect(STEPS.length).toBe(5);
    expect(TOTAL_STEPS).toBe(5);
    expect(STEPS.map(s => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(STEPS.map(s => s.key)).toEqual(["venue", "brand", "tables", "team", "launch"]);
  });

  test("stepByNumber returns metadata for valid steps and null otherwise", () => {
    expect(stepByNumber(1)?.key).toBe("venue");
    expect(stepByNumber(5)?.key).toBe("launch");
    expect(stepByNumber(0)).toBeNull();
    expect(stepByNumber(6)).toBeNull();
  });
});

describe("readState", () => {
  test("null / undefined / non-object → INITIAL_STATE", () => {
    expect(readState(null)).toEqual(INITIAL_STATE);
    expect(readState(undefined)).toEqual(INITIAL_STATE);
    expect(readState("oops")).toEqual(INITIAL_STATE);
    expect(readState(42)).toEqual(INITIAL_STATE);
  });

  test("happy-path object round-trips cleanly", () => {
    const got = readState({ currentStep: 3, completedSteps: [1, 2], solo: true });
    expect(got).toEqual({ currentStep: 3, completedSteps: [1, 2], solo: true });
  });

  test("clamps an out-of-range currentStep down to 1", () => {
    expect(readState({ currentStep: 99, completedSteps: [], solo: false }).currentStep).toBe(1);
    expect(readState({ currentStep: 0, completedSteps: [], solo: false }).currentStep).toBe(1);
    expect(readState({ currentStep: -3, completedSteps: [], solo: false }).currentStep).toBe(1);
  });

  test("drops garbage entries in completedSteps and de-dupes + sorts", () => {
    const got = readState({
      currentStep: 1,
      completedSteps: [3, "x", 1, null, 1, 2, 99],
      solo: false,
    });
    expect(got.completedSteps).toEqual([1, 2, 3]);
  });

  test("missing solo defaults to false", () => {
    expect(readState({ currentStep: 2, completedSteps: [1] }).solo).toBe(false);
  });
});

describe("pickInitialStep", () => {
  test("server state wins when present", () => {
    const s = snap({
      state: { currentStep: 4, completedSteps: [1, 2, 3], solo: false },
    });
    expect(pickInitialStep(s)).toBe(4);
  });

  test("server state pinned to TOTAL_STEPS for over-range values", () => {
    const s = snap({
      state: { currentStep: 99, completedSteps: [], solo: false },
    });
    expect(pickInitialStep(s)).toBe(TOTAL_STEPS);
  });

  test("falls back to step 1 when ZIP is sentinel '00000'", () => {
    expect(pickInitialStep(snap({ zipCode: "00000" }))).toBe(1);
  });

  test("falls back to step 1 when ZIP is null", () => {
    expect(pickInitialStep(snap({ zipCode: null }))).toBe(1);
  });

  test("falls back to step 2 when ZIP is set but brand fields are all empty", () => {
    const s = snap({
      zipCode: "77002",
      brandColor: null,
      logoUrl: null,
      welcomeMessage: null,
    });
    expect(pickInitialStep(s)).toBe(2);
  });

  test("falls back to step 3 when ZIP + brand are set but tableCount is zero", () => {
    expect(pickInitialStep(snap({ tableCount: 0 }))).toBe(3);
  });

  test("falls back to step 4 when basics are set but no team is invited and solo isn't set", () => {
    const s = snap({ staffCount: 1, solo: false });
    expect(pickInitialStep(s)).toBe(4);
  });

  test("lands on step 5 when everything is set OR solo is explicitly true", () => {
    expect(pickInitialStep(snap({ staffCount: 2 }))).toBe(5);
    expect(pickInitialStep(snap({ staffCount: 1, solo: true }))).toBe(5);
  });
});

describe("isOnboardingComplete", () => {
  test("explicit onboardingCompletedAt timestamp is the strongest signal", () => {
    const s = snap({
      onboardingCompletedAt: new Date(),
      zipCode: "00000", // even if other state looks unfinished
      brandColor: null,
      tableCount: 0,
    });
    expect(isOnboardingComplete(s)).toBe(true);
  });

  test("legacy venue with all required fields counts as complete", () => {
    const s = snap({
      onboardingCompletedAt: null,
      zipCode: "77002",
      brandColor: "#222",
      tableCount: 6,
    });
    expect(isOnboardingComplete(s)).toBe(true);
  });

  test("sentinel ZIP keeps the venue incomplete", () => {
    expect(isOnboardingComplete(snap({ zipCode: "00000" }))).toBe(false);
  });

  test("missing brand field keeps the venue incomplete", () => {
    const s = snap({ brandColor: null, logoUrl: null, welcomeMessage: null });
    expect(isOnboardingComplete(s)).toBe(false);
  });

  test("zero tables keeps the venue incomplete", () => {
    expect(isOnboardingComplete(snap({ tableCount: 0 }))).toBe(false);
  });
});

describe("recordStepComplete", () => {
  test("adds the step and advances the cursor", () => {
    const next = recordStepComplete(INITIAL_STATE, 1);
    expect(next.completedSteps).toEqual([1]);
    expect(next.currentStep).toBe(2);
  });

  test("idempotent on repeat saves", () => {
    let s = recordStepComplete(INITIAL_STATE, 1);
    s = recordStepComplete(s, 1);
    expect(s.completedSteps).toEqual([1]);
  });

  test("cursor never regresses if a later step is already in progress", () => {
    const s = { currentStep: 4, completedSteps: [1, 2, 3], solo: false };
    const next = recordStepComplete(s, 2);
    expect(next.currentStep).toBe(4); // still on 4
    expect(next.completedSteps).toEqual([1, 2, 3]);
  });

  test("cursor pins to TOTAL_STEPS past the last step", () => {
    const s = { currentStep: TOTAL_STEPS, completedSteps: [1, 2, 3, 4], solo: false };
    const next = recordStepComplete(s, TOTAL_STEPS);
    expect(next.currentStep).toBe(TOTAL_STEPS);
    expect(next.completedSteps).toEqual([1, 2, 3, 4, 5]);
  });

  test("out-of-range step numbers are ignored", () => {
    expect(recordStepComplete(INITIAL_STATE, 0)).toBe(INITIAL_STATE);
    expect(recordStepComplete(INITIAL_STATE, 99)).toBe(INITIAL_STATE);
  });
});

describe("progressPercent", () => {
  test("0 / 5 → 0%, 2 / 5 → 40%, 5 / 5 → 100%", () => {
    expect(progressPercent(INITIAL_STATE)).toBe(0);
    expect(progressPercent({ currentStep: 3, completedSteps: [1, 2], solo: false })).toBe(40);
    expect(
      progressPercent({ currentStep: 5, completedSteps: [1, 2, 3, 4, 5], solo: false }),
    ).toBe(100);
  });
});
