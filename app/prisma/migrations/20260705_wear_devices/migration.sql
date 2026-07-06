-- Wearables: paired smartwatch devices for floor staff + the single-use
-- pairing codes that bridge phone → watch authentication. Powers the
-- /api/wear/* device API consumed by sdk/tabcall-wear (watchOS / Wear OS
-- / any JS-capable wearable).
--
-- Rollback:
--   DROP TABLE "WearPairCode";
--   DROP TABLE "WearDevice";

-- 1) WearDevice — one row per paired watch, FK to the staff member.
CREATE TABLE "WearDevice" (
  "id"            TEXT NOT NULL,
  "staffId"       TEXT NOT NULL,
  -- Human label shown in the staff console ("Maya's Galaxy Watch").
  "name"          TEXT NOT NULL,
  -- Free-text platform tag ("wearos" | "watchos" | "tizen" | ...).
  "platform"      TEXT NOT NULL,
  -- Push token registered by the watch app itself (FCM on Wear OS).
  -- Distinct from StaffMember.fcmToken (the phone PWA).
  "fcmToken"      TEXT,
  -- Lower bound on accepted JWT iat for this device; bumped on re-pair.
  "tokenIssuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"     TIMESTAMP(3),
  "lastSeenAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WearDevice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WearDevice_staffId_idx" ON "WearDevice"("staffId");

ALTER TABLE "WearDevice"
  ADD CONSTRAINT "WearDevice_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) WearPairCode — sha256-hashed 6-digit codes, 10-minute TTL, single-use.
CREATE TABLE "WearPairCode" (
  "id"        TEXT NOT NULL,
  "staffId"   TEXT NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WearPairCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WearPairCode_codeHash_key" ON "WearPairCode"("codeHash");
CREATE INDEX "WearPairCode_staffId_createdAt_idx" ON "WearPairCode"("staffId", "createdAt");
CREATE INDEX "WearPairCode_expiresAt_idx" ON "WearPairCode"("expiresAt");

-- 3) RLS: same posture as every other table (audit Finding #9). The app
-- connects as the table owner (bypasses RLS); enabling it with no
-- policies means Supabase's anon/authenticated PostgREST roles can't
-- read device tokens or pairing-code hashes.
ALTER TABLE "WearDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WearPairCode" ENABLE ROW LEVEL SECURITY;
