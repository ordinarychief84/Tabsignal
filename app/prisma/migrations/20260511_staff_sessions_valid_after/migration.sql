-- Per-staff "sessions valid after" timestamp. "Sign out everywhere"
-- bumps this to NOW(); any cached JWT whose iat is earlier than this
-- value is rejected at verifySessionToken. Existing rows keep NULL
-- (no restriction) so the feature is opt-in by the user.

ALTER TABLE "StaffMember" ADD COLUMN "sessionsValidAfter" TIMESTAMP(3);
