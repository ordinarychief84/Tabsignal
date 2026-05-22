-- Closes the RLS coverage gap surfaced by rls-coverage.test.ts.
--
-- 14 Prisma models added since the 20260515_enable_rls_legacy_tables
-- migration (Guest Commerce Module + admin extensions + POS sync)
-- never got RLS enabled in a migration file. Per the original RLS
-- migration's note, the Guest Commerce tables had RLS enabled via
-- Supabase Studio at deploy time — but that's brittle: a fresh DB
-- from `prisma migrate deploy` wouldn't get those policies, and a
-- new dev clone runs without RLS. This migration codifies the
-- production posture in the migration history so it's reproducible.
--
-- Strategy: same as 20260515_enable_rls_legacy_tables. Enable RLS
-- with NO permissive policies. Prisma connects via a BYPASSRLS role
-- so app traffic is unaffected; PostgREST anon/authenticated
-- requests return 0 rows.
--
-- Rollback (per-table):
--   ALTER TABLE "<TableName>" DISABLE ROW LEVEL SECURITY;
--
-- Idempotent: ENABLE on an already-enabled table is a no-op in
-- Postgres, so re-applying against a Supabase Studio-pre-configured
-- prod DB is safe.

-- Guest Commerce Module (migration 20260512_guest_commerce_v2)
ALTER TABLE "Order"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bill"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillItem"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillSplitV2"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillSplitItem"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Promotion"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionItem"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wishlist"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WishlistItem"    ENABLE ROW LEVEL SECURITY;

-- POS + branding extensions (migrations 20260509_admin_panel_extensions,
-- 20260512_admin_panel_b_extensions)
ALTER TABLE "VenueBranding"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PosIntegration"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PosSyncLog"      ENABLE ROW LEVEL SECURITY;

-- Operator audit (migration 20260511_operator_audit_log)
ALTER TABLE "OperatorAuditLog" ENABLE ROW LEVEL SECURITY;
