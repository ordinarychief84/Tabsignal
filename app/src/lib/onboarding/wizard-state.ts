/**
 * Pure helpers for the onboarding wizard.
 *
 * Step numbering, "where should the user land?" routing, and the
 * shape of the server-persisted state column live here so they can be
 * unit tested without dragging in React or Prisma. The wizard
 * (app/admin/v/[slug]/onboarding/onboarding-wizard.tsx) and the venue
 * dashboard's resume banner both read from these helpers, so a change
 * to step ordering only lands in one place.
 *
 * Why server-persisted? The old wizard kept the user's venueType +
 * feature toggles in localStorage. Clear-data, private mode, or
 * switching devices lost the picks. The new column
 * `Venue.onboardingState` survives all of those.
 */

export type StepKey = "venue" | "brand" | "tables" | "team" | "launch";

export type Step = {
  n: number;
  key: StepKey;
  label: string;
};

/**
 * Step order is fixed in storage (n=1..5) so a saved `currentStep` is
 * stable across deploys even if we later add cosmetic reshuffles.
 *
 * Why these five and not the old "features" toggle step? Setting
 * cosmetic feature flags before any feature actually gates on them
 * was filler — the wizard wrote JSON nobody read. Inviting a teammate
 * is concrete go-live work that benefits from being inside the flow.
 */
export const STEPS: ReadonlyArray<Step> = [
  { n: 1, key: "venue",  label: "Venue"  },
  { n: 2, key: "brand",  label: "Brand"  },
  { n: 3, key: "tables", label: "Tables" },
  { n: 4, key: "team",   label: "Team"   },
  { n: 5, key: "launch", label: "Launch" },
];

export const TOTAL_STEPS = STEPS.length;

/** Shape of the JSON we store in `Venue.onboardingState`. The column is
 *  permissive — anything we don't recognise on read we ignore. */
export type OnboardingState = {
  currentStep: number;
  completedSteps: number[];
  solo: boolean;
};

/** Snapshot of the venue fields the routing helpers need. Mirrors the
 *  selection used by the onboarding page server wrapper. */
export type VenueSnapshot = {
  zipCode: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  welcomeMessage: string | null;
  venueType: string | null;
  tableCount: number;
  staffCount: number;
  solo: boolean;
  /** `null` when the column doesn't exist yet (pre-migration tests) or
   *  the venue didn't store anything. Treated as a fresh state. */
  state: OnboardingState | null;
  onboardingCompletedAt: Date | null;
};

/** Safe default for a venue that hasn't started the wizard. */
export const INITIAL_STATE: OnboardingState = {
  currentStep: 1,
  completedSteps: [],
  solo: false,
};

/** Coerce whatever `Venue.onboardingState` happens to be into a typed
 *  shape. Defends against partial writes, schema drift, hand-edits in
 *  the database. Never throws. */
export function readState(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== "object") return { ...INITIAL_STATE };
  const r = raw as Record<string, unknown>;
  const currentStep =
    typeof r.currentStep === "number" && Number.isInteger(r.currentStep) && r.currentStep >= 1 && r.currentStep <= TOTAL_STEPS
      ? r.currentStep
      : 1;
  const completedSteps = Array.isArray(r.completedSteps)
    ? r.completedSteps.filter(
        (n): n is number =>
          typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= TOTAL_STEPS,
      )
    : [];
  // De-dupe defensively — a buggy client double-write shouldn't show
  // ✓✓✓ on the progress dots.
  const dedupedCompleted = Array.from(new Set(completedSteps)).sort((a, b) => a - b);
  const solo = typeof r.solo === "boolean" ? r.solo : false;
  return { currentStep, completedSteps: dedupedCompleted, solo };
}

/**
 * Decide where to drop the user when they (re)open onboarding.
 *
 * Priority order:
 *  1. If a server-persisted `currentStep` exists, honour it — the user
 *     left explicitly mid-flow, don't second-guess.
 *  2. Otherwise infer from venue completeness so a legacy venue that
 *     pre-dates this column still routes sensibly:
 *     - Empty / sentinel ZIP → step 1
 *     - Missing brand colour, logo, AND welcome message → step 2
 *     - Zero tables (shouldn't happen post-signup, but defensive) → 3
 *     - Solo flag not set AND only the owner exists → step 4
 *     - Otherwise → step 5 (launch screen)
 */
export function pickInitialStep(snapshot: VenueSnapshot): number {
  if (snapshot.state && snapshot.state.currentStep >= 1) {
    return Math.min(snapshot.state.currentStep, TOTAL_STEPS);
  }
  if (!snapshot.zipCode || snapshot.zipCode === "00000") return 1;
  if (!snapshot.brandColor && !snapshot.logoUrl && !snapshot.welcomeMessage) return 2;
  if (snapshot.tableCount === 0) return 3;
  if (!snapshot.solo && snapshot.staffCount <= 1) return 4;
  return TOTAL_STEPS;
}

/** Server-side "are we done?" check. Used by the dashboard to decide
 *  whether to render the resume banner.
 *
 *  We trust the explicit `onboardingCompletedAt` stamp first — the
 *  user clicked Launch. We also infer "done" for legacy venues that
 *  have populated all required fields, so the resume banner doesn't
 *  ambush an existing manager just because the column is null.
 */
export function isOnboardingComplete(snapshot: VenueSnapshot): boolean {
  if (snapshot.onboardingCompletedAt) return true;
  const hasRealZip = !!snapshot.zipCode && snapshot.zipCode !== "00000";
  const hasBrand = !!snapshot.brandColor || !!snapshot.logoUrl || !!snapshot.welcomeMessage;
  const hasTables = snapshot.tableCount > 0;
  return hasRealZip && hasBrand && hasTables;
}

/** Mark a step complete, advance the cursor, and return the new state.
 *  Idempotent — re-saving the same step is a no-op. Past the last
 *  step the cursor pins to TOTAL_STEPS. */
export function recordStepComplete(state: OnboardingState, step: number): OnboardingState {
  if (step < 1 || step > TOTAL_STEPS) return state;
  const completedSteps = state.completedSteps.includes(step)
    ? state.completedSteps
    : [...state.completedSteps, step].sort((a, b) => a - b);
  const currentStep = Math.min(Math.max(state.currentStep, step + 1), TOTAL_STEPS);
  return { ...state, completedSteps, currentStep };
}

/** Percent complete based on completedSteps, 0..100. Used by the
 *  resume banner and the progress bar. */
export function progressPercent(state: OnboardingState): number {
  const done = state.completedSteps.length;
  return Math.round((done / TOTAL_STEPS) * 100);
}

/** Look up step metadata by number. Returns null for out-of-range
 *  inputs so consumers can render a sensible empty state. */
export function stepByNumber(n: number): Step | null {
  return STEPS.find(s => s.n === n) ?? null;
}
