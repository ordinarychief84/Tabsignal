-- Phase-1 RBAC + audit log
--
-- Adds real roles to StaffRole (was single-value STAFF), introduces
-- StaffStatus (ACTIVE/INVITED/SUSPENDED), tracks lastSeenAt + invitedBy +
-- suspendedBy, and creates AuditLog for sensitive admin actions.
--
-- Backfill: every pre-existing StaffMember was the venue creator from
-- /api/signup (only path that created staff before this migration), so
-- they all get promoted to OWNER. Default for *new* rows is SERVER —
-- the invite endpoint will explicitly choose a role.

-- 1. Extend StaffRole with the real values. STAFF is left in the enum
--    so existing rows / cached session JWTs don't fail. New rows must
--    not be assigned STAFF.
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'SERVER';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'HOST';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'VIEWER';

-- 2. Backfill: promote every existing STAFF row to OWNER. Today these
--    are venue creators by construction (signup is the only path that
--    minted StaffMember rows). Wrapped in DO so re-running this
--    migration on a DB that already has new role values is safe.
UPDATE "StaffMember" SET "role" = 'OWNER' WHERE "role" = 'STAFF';

-- 3. New StaffStatus enum.
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- 4. Extend StaffMember with status + lastSeenAt + invite/suspend audit columns.
ALTER TABLE "StaffMember"
  ADD COLUMN "status"        "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lastSeenAt"    TIMESTAMP(3),
  ADD COLUMN "invitedById"   TEXT,
  ADD COLUMN "suspendedAt"   TIMESTAMP(3),
  ADD COLUMN "suspendedById" TEXT;

-- 5. Self-FKs for invitedBy / suspendedBy. ON DELETE SET NULL so removing
--    the inviter doesn't cascade and orphan the invitee.
ALTER TABLE "StaffMember"
  ADD CONSTRAINT "StaffMember_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "StaffMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffMember"
  ADD CONSTRAINT "StaffMember_suspendedById_fkey"
  FOREIGN KEY ("suspendedById") REFERENCES "StaffMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. New venue-status index for the People page filter.
CREATE INDEX "StaffMember_venueId_status_idx" ON "StaffMember"("venueId", "status");

-- 7. AuditLog model.
CREATE TABLE "AuditLog" (
  "id"         TEXT NOT NULL,
  "venueId"    TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "actorRole"  TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "targetType" TEXT,
  "targetId"   TEXT,
  "metadata"   JSONB NOT NULL DEFAULT '{}',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AuditLog_venueId_createdAt_idx" ON "AuditLog"("venueId", "createdAt");
CREATE INDEX "AuditLog_venueId_action_idx"    ON "AuditLog"("venueId", "action");
