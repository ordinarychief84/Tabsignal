-- PlatformAdmin: DB-backed founder/super-admin allowlist.
-- Lets the founder UI add/suspend/remove TabCall admins without
-- touching Vercel env. The OPERATOR_EMAILS env stays as a fallback
-- so a DB outage can't lock all founders out.

CREATE TABLE "PlatformAdmin" (
  "id"            TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "name"          TEXT,
  "notes"         TEXT,
  "addedById"     TEXT,
  "suspendedAt"   TIMESTAMP(3),
  "suspendedById" TEXT,
  "lastSeenAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE INDEX        "PlatformAdmin_email_idx" ON "PlatformAdmin"("email");

ALTER TABLE "PlatformAdmin"
  ADD CONSTRAINT "PlatformAdmin_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "PlatformAdmin"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlatformAdmin"
  ADD CONSTRAINT "PlatformAdmin_suspendedById_fkey"
  FOREIGN KEY ("suspendedById") REFERENCES "PlatformAdmin"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
