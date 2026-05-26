-- Two unrelated additions bundled into one migration because they
-- both ship with the Feature-gap batch PR and there's no order
-- dependency: (1) StaffStatus enum gains DELETED for soft-removal of
-- resigned/fired staff; (2) PasswordResetToken table powers the new
-- /forgot-password → email link → /reset-password flow.
--
-- Rollback:
--   DROP TABLE "PasswordResetToken";
--   ALTER TYPE "StaffStatus" RENAME VALUE 'DELETED' TO 'ARCHIVED';
--   -- (Postgres can't drop enum values; rename to a no-op label or
--   --  recreate the type. Down-migrations are uncommon here.)

-- 1) StaffStatus = ACTIVE | INVITED | SUSPENDED | DELETED
ALTER TYPE "StaffStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- 2) PasswordResetToken — single-use, time-bounded reset tokens.
CREATE TABLE "PasswordResetToken" (
  "id"          TEXT NOT NULL,
  "staffId"     TEXT NOT NULL,
  -- We store sha256(token), not the token itself. A DB dump can't be
  -- used to mint replacements.
  "tokenHash"   TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "usedAt"      TIMESTAMP(3),
  "requestIp"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Unique hash so a leaked DB can't be replayed via the same token.
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"
  ON "PasswordResetToken"("tokenHash");

-- Lookups: "give me this staff member's recent reset attempts".
CREATE INDEX "PasswordResetToken_staffId_createdAt_idx"
  ON "PasswordResetToken"("staffId", "createdAt");

-- Cron sweep: delete expired tokens older than 24h grace.
CREATE INDEX "PasswordResetToken_expiresAt_idx"
  ON "PasswordResetToken"("expiresAt");

-- FK with ON DELETE CASCADE — if a staff row is hard-deleted later
-- (e.g. GDPR), their reset tokens go with it.
ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS posture matches the rest of the schema. Enable + no policies =
-- BYPASSRLS Postgres role (the Prisma client) sees rows; anon /
-- authenticated PostgREST sees nothing.
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
