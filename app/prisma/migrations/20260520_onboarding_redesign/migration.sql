-- Onboarding redesign: server-persisted wizard state.
--
-- Adds three columns to Venue:
--   * venueType — free-text classifier ("restaurant", "cafe", ...). Was
--     stored client-only in localStorage; promoting it to a column so
--     analytics and per-vertical features can query it.
--   * onboardingState — JSONB; { currentStep: int, completedSteps: int[],
--     solo: bool }. Allows the wizard to resume on any device.
--   * onboardingCompletedAt — DateTime; null until the user clicks the
--     explicit "Launch venue" CTA on the final step. Lets the dashboard
--     decide whether to show the resume banner.

ALTER TABLE "Venue"
  ADD COLUMN "venueType"             TEXT,
  ADD COLUMN "onboardingState"       JSONB,
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: any venue created before this migration that has a real ZIP
-- (sentinel "00000" is the not-yet-onboarded marker from /api/signup)
-- AND a brandColor is treated as already completed — set their stamp to
-- their createdAt so the resume banner doesn't ambush legacy users.
UPDATE "Venue"
  SET "onboardingCompletedAt" = "createdAt"
  WHERE "zipCode" IS NOT NULL
    AND "zipCode" <> '00000'
    AND "brandColor" IS NOT NULL
    AND "onboardingCompletedAt" IS NULL;
