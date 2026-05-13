-- Add password-based sign-in for the super-admin console.
-- Both columns nullable so existing rows keep working unchanged.
ALTER TABLE "PlatformAdmin"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
