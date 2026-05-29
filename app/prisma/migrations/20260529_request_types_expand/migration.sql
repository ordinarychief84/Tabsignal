-- Expand RequestType with four new guest-request categories so the floor
-- queue can distinguish them for routing + analytics instead of lumping
-- everything under HELP:
--   FOOD     — ready to order / kitchen request
--   CLEAN    — clear or wipe the table
--   MANAGER  — ask to speak with a manager
--   SUPPLIES — napkins, cutlery, condiments, etc.
--
-- Postgres can ADD enum values online (no table rewrite). IF NOT EXISTS
-- keeps the migration idempotent and safe to re-run, matching the
-- StaffStatus.DELETED addition pattern.
--
-- Rollback: Postgres can't drop enum values. To revert, recreate the type
-- without these labels (only safe while no row uses them):
--   ALTER TYPE "RequestType" RENAME VALUE 'FOOD' TO 'FOOD_DEPRECATED';
--   -- (etc.)

ALTER TYPE "RequestType" ADD VALUE IF NOT EXISTS 'FOOD';
ALTER TYPE "RequestType" ADD VALUE IF NOT EXISTS 'CLEAN';
ALTER TYPE "RequestType" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "RequestType" ADD VALUE IF NOT EXISTS 'SUPPLIES';
