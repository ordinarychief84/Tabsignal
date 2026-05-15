-- Persist the onboarding Step 4 feature toggles on the Venue row.
-- Null means "use defaults" (every guest-facing feature enabled).
ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "enabledFeatures" JSONB;
