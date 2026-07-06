-- Bootstrap split, part 1 of 2 — the enum ADDs from
-- prisma/migrations/20260510_rbac_audit_log_phase1/migration.sql.
--
-- That migration adds StaffRole values and UPDATEs rows to one of them
-- in the same file. Prisma applies each migration in a single
-- transaction, and Postgres (55P04) forbids using an enum value added
-- in the current transaction — so the file can never replay on a fresh
-- database. Production never replayed it either (it was repaired via
-- scripts/baseline-prod.sql); scripts/bootstrap-dev-db.mjs applies the
-- SAME statements in two commits, then marks the original migration
-- applied. The historical migration file is deliberately untouched.
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'SERVER';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'HOST';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'VIEWER';
