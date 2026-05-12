-- Staff role: switch column default from legacy 'STAFF' to 'SERVER' and
-- backfill any rows that slipped through with role='STAFF'.
--
-- Context: the init migration set the column default to 'STAFF' (the
-- only enum value at the time). The Phase-1 RBAC migration extended
-- the enum and one-shot-backfilled pre-existing rows to 'OWNER', but
-- did NOT alter the column default. Rows created afterward by
-- /api/signup (which doesn't pass a role) ended up with 'STAFF',
-- leaving the venue creator without any manager permissions because
-- the `can()` matrix treats STAFF as read-only legacy.
--
-- The signup route is being patched in the same change to explicitly
-- pass role='OWNER', but this migration handles two things:
--   1. Any existing STAFF rows that were minted post-RBAC migration
--      (likely the venue creator). Promote them to OWNER — they are
--      the venue creator by construction (same logic the RBAC
--      backfill used).
--   2. Future rows created without an explicit role should default to
--      SERVER, matching the Prisma schema's @default(SERVER) and the
--      "floor is the safe fallback" comment in the invite endpoint.

UPDATE "StaffMember" SET "role" = 'OWNER' WHERE "role" = 'STAFF';

ALTER TABLE "StaffMember" ALTER COLUMN "role" SET DEFAULT 'SERVER';
