-- Federated sign-in identities (OAuth/OIDC) — powers Google sign-in
-- (lib/auth/oauth-google, /api/auth/google/*). One row per
-- (provider, subject) → StaffMember. Additive only.
--
-- Rollback: DROP TABLE "AuthIdentity";

CREATE TABLE "AuthIdentity" (
  "id"          TEXT NOT NULL,
  "staffId"     TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoginAt" TIMESTAMP(3),

  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthIdentity_provider_subject_key" ON "AuthIdentity"("provider", "subject");
CREATE INDEX "AuthIdentity_staffId_idx" ON "AuthIdentity"("staffId");

ALTER TABLE "AuthIdentity"
  ADD CONSTRAINT "AuthIdentity_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same posture as every table (audit Finding #9). App connects as
-- table owner (bypasses RLS); enabling with no policies keeps Supabase's
-- anon/authenticated PostgREST roles out of federated-identity rows.
ALTER TABLE "AuthIdentity" ENABLE ROW LEVEL SECURITY;
