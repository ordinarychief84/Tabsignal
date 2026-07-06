import { describe, expect, test } from "bun:test";
import { readOnboardingState, deriveOnboarding, type OnboardingInputs } from "../onboarding";

function baseInputs(overrides: Partial<OnboardingInputs> = {}): OnboardingInputs {
  return {
    state: { currentStep: 1, completedSteps: [], solo: false },
    venueType: null,
    brandColor: null,
    staffCount: 1, // just the owner
    stripeChargesEnabled: false,
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe("readOnboardingState", () => {
  test("null / undefined / junk collapse to the empty state", () => {
    for (const raw of [null, undefined, 42, "wizard", [], true]) {
      expect(readOnboardingState(raw)).toEqual({ currentStep: 1, completedSteps: [], solo: false });
    }
  });

  test("valid persisted shape passes through", () => {
    expect(
      readOnboardingState({ currentStep: 3, completedSteps: [1, 2], solo: true }),
    ).toEqual({ currentStep: 3, completedSteps: [1, 2], solo: true });
  });

  test("out-of-range and non-numeric steps are dropped, dupes deduped", () => {
    const s = readOnboardingState({
      currentStep: 99,
      completedSteps: [0, 1, 1, 2, 6, "3", null],
      solo: "yes",
    });
    expect(s.currentStep).toBe(1);
    expect(s.completedSteps).toEqual([1, 2]);
    expect(s.solo).toBe(false);
  });
});

describe("deriveOnboarding", () => {
  test("fresh venue: nothing done, 0%, next step 1", () => {
    const p = deriveOnboarding(baseInputs());
    expect(p.percent).toBe(0);
    expect(p.complete).toBe(false);
    expect(p.nextStep).toBe(1);
    expect(p.steps.every(s => !s.done)).toBe(true);
  });

  test("venueType set counts as brand done (derived)", () => {
    const p = deriveOnboarding(baseInputs({ venueType: "bar" }));
    const brand = p.steps.find(s => s.id === "brand")!;
    expect(brand.done).toBe(true);
    expect(brand.derived).toBe(true);
    expect(p.percent).toBe(25);
    expect(p.nextStep).toBe(2);
  });

  test("staffCount > 1 counts as team done; solo flag too", () => {
    const withStaff = deriveOnboarding(baseInputs({ staffCount: 3 }));
    expect(withStaff.steps.find(s => s.id === "team")!.done).toBe(true);

    const solo = deriveOnboarding(
      baseInputs({ state: { currentStep: 3, completedSteps: [], solo: true } }),
    );
    expect(solo.steps.find(s => s.id === "team")!.done).toBe(true);
  });

  test("stripeChargesEnabled counts as payments done", () => {
    const p = deriveOnboarding(baseInputs({ stripeChargesEnabled: true }));
    expect(p.steps.find(s => s.id === "payments")!.done).toBe(true);
  });

  test("explicit check-offs count even when nothing is derivable", () => {
    const p = deriveOnboarding(
      baseInputs({ state: { currentStep: 5, completedSteps: [1, 2, 3, 4], solo: false } }),
    );
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(false); // launch not yet pressed
    expect(p.nextStep).toBe(5);
  });

  test("completedAt stamp marks the flow complete at 100%", () => {
    const p = deriveOnboarding(baseInputs({ onboardingCompletedAt: new Date() }));
    expect(p.complete).toBe(true);
    expect(p.percent).toBe(100);
    expect(p.steps.find(s => s.id === "launch")!.done).toBe(true);
  });
});
