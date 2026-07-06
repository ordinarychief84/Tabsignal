-- Bootstrap split, part 2 of 2 — everything after the enum ADDs in
-- prisma/migrations/20260510_rbac_audit_log_phase1/migration.sql,
-- byte-for-byte except this header. Runs in its own transaction AFTER
-- part 1 committed, so the 'OWNER' backfill is legal.
UPDATE "StaffMember" SET "role" = 'OWNER' WHERE "role" = 'STAFF';

CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

ALTER TABLE "StaffMember"
  ADD COLUMN "status"        "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lastSeenAt"    TIMESTAMP(3),
  ADD COLUMN "invitedById"   TEXT,
  ADD COLUMN "suspendedAt"   TIMESTAMP(3),
  ADD COLUMN "suspendedById" TEXT;

ALTER TABLE "StaffMember"
  ADD CONSTRAINT "StaffMember_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "StaffMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffMember"
  ADD CONSTRAINT "StaffMember_suspendedById_fkey"
  FOREIGN KEY ("suspendedById") REFERENCES "StaffMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StaffMember_venueId_status_idx" ON "StaffMember"("venueId", "status");

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
