-- Bootstrap variant of prisma/migrations/20260515_enable_rls_legacy_tables.
--
-- The original ALTERs 29 tables by name, but two of them (EmailTemplate,
-- PlatformConfig) exist only on production — created via Supabase Studio
-- in the pre-migrations era and never added to schema.prisma or any
-- CREATE TABLE migration. On a fresh database the original therefore
-- fails with 42P01. This variant enables RLS on every table that exists
-- and silently skips the ones that don't, preserving the original's
-- effect exactly on both fresh and legacy databases.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AuditLog', 'BenchmarkSnapshot', 'BillSplit', 'CompAction',
    'EmailTemplate', 'FeedbackReport', 'GuestNote', 'GuestProfile',
    'GuestProfileOtp', 'GuestSession', 'LinkTokenUse', 'MenuCategory',
    'MenuItem', 'OrgMember', 'Organization', 'PlatformAdmin',
    'PlatformConfig', 'PreOrder', 'Request', 'Reservation',
    'StaffMember', 'Table', 'TableAssignment', 'TipPool',
    'TipPoolShare', 'Venue', 'VenueSpecial', 'Waitlist', 'WebhookEvent'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
