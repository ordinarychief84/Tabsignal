/**
 * Venue onboarding launchpad — pure derivation helpers.
 *
 * The wizard UI was scrapped in PR #43's final form, but the schema
 * kept the rails: Venue.onboardingState (jsonb), Venue.venueType,
 * Venue.onboardingCompletedAt. The launchpad builds on those exact
 * columns so no migration is needed and legacy backfilled venues
 * (onboardingCompletedAt = createdAt) stay silent.
 *
 * Steps are numbered 1–5 to match the shape the venue PATCH route
 * already validates: { currentStep, completedSteps[], solo }.
 *
 *   1  Brand      — venueType picked (brand color optional polish)
 *   2  Tables     — QR tents printed (manual check-off; we can't sense paper)
 *   3  Team       — ≥1 teammate invited, or explicitly solo
 *   4  Payments   — Stripe charges enabled, or explicitly deferred
 *   5  Launch     — explicit "Go live" → onboardingCompletedAt stamped
 */

export type OnboardingStateShape = {
  currentStep: number;
  completedSteps: number[];
  solo: boolean;
};

export const ONBOARDING_STEPS = [
  { step: 1, id: "brand",    title: "Make it yours" },
  { step: 2, id: "tables",   title: "Print your table QRs" },
  { step: 3, id: "team",     title: "Invite your team" },
  { step: 4, id: "payments", title: "Get paid" },
  { step: 5, id: "launch",   title: "Go live" },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

/** Defensive parse of the jsonb column — hand-edited or legacy shapes
 *  collapse to the empty state instead of crashing the dashboard. */
export function readOnboardingState(raw: unknown): OnboardingStateShape {
  const empty: OnboardingStateShape = { currentStep: 1, completedSteps: [], solo: false };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return empty;
  const o = raw as Record<string, unknown>;
  const currentStep =
    typeof o.currentStep === "number" && Number.isInteger(o.currentStep) && o.currentStep >= 1 && o.currentStep <= 5
      ? o.currentStep
      : 1;
  const completedSteps = Array.isArray(o.completedSteps)
    ? o.completedSteps.filter(
        (s): s is number => typeof s === "number" && Number.isInteger(s) && s >= 1 && s <= 5,
      )
    : [];
  const solo = o.solo === true;
  return { currentStep, completedSteps: [...new Set(completedSteps)].sort(), solo };
}

export type OnboardingInputs = {
  state: OnboardingStateShape;
  venueType: string | null;
  brandColor: string | null;
  /** ACTIVE + INVITED staff count, including the owner. */
  staffCount: number;
  stripeChargesEnabled: boolean;
  onboardingCompletedAt: Date | null;
};

export type OnboardingStepStatus = {
  step: number;
  id: OnboardingStepId;
  title: string;
  done: boolean;
  /** True when done was inferred from live venue data rather than the
   *  persisted checklist — used for "auto-completed" microcopy. */
  derived: boolean;
};

export type OnboardingProgress = {
  steps: OnboardingStepStatus[];
  /** 0–100, launch step excluded from the denominator (it IS completion). */
  percent: number;
  complete: boolean;
  /** First not-done step number — where a resume banner should deep-link. */
  nextStep: number;
};

export function deriveOnboarding(input: OnboardingInputs): OnboardingProgress {
  const { state } = input;
  const checked = new Set(state.completedSteps);
  const complete = input.onboardingCompletedAt !== null;

  const stepDone: Record<OnboardingStepId, { done: boolean; derived: boolean }> = {
    brand: {
      done: checked.has(1) || input.venueType !== null,
      derived: !checked.has(1) && input.venueType !== null,
    },
    tables: { done: checked.has(2), derived: false },
    team: {
      done: checked.has(3) || state.solo || input.staffCount > 1,
      derived: !checked.has(3) && !state.solo && input.staffCount > 1,
    },
    payments: {
      done: checked.has(4) || input.stripeChargesEnabled,
      derived: !checked.has(4) && input.stripeChargesEnabled,
    },
    launch: { done: complete, derived: false },
  };

  const steps: OnboardingStepStatus[] = ONBOARDING_STEPS.map(s => ({
    step: s.step,
    id: s.id,
    title: s.title,
    done: stepDone[s.id].done,
    derived: stepDone[s.id].derived,
  }));

  const preLaunch = steps.filter(s => s.id !== "launch");
  const doneCount = preLaunch.filter(s => s.done).length;
  const percent = complete ? 100 : Math.round((doneCount / preLaunch.length) * 100);
  const firstOpen = steps.find(s => !s.done);

  return {
    steps,
    percent,
    complete,
    nextStep: firstOpen?.step ?? 5,
  };
}
