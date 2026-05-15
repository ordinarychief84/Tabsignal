-- Closes audit Finding #9 (Security audit, 2026-05-13).
--
-- 29 legacy public-schema tables (including StaffMember, PlatformAdmin,
-- Organization, Venue, GuestSession, LinkTokenUse, WebhookEvent) were
-- exposed to Supabase's PostgREST anon/authenticated API. The 13 Guest
-- Commerce tables added in 20260512_guest_commerce_v2 had RLS enabled
-- via Supabase Studio at deploy time; the older tables did not.
--
-- Strategy: enable RLS with NO permissive policies. The Prisma client
-- connects via the `postgres` role which has BYPASSRLS in Supabase by
-- default, so app traffic is unaffected. anon / authenticated queries
-- via /rest/v1/<table> now return 0 rows.
--
-- Rollback (per-table):
--   ALTER TABLE "<TableName>" DISABLE ROW LEVEL SECURITY;
--
-- Verified safe via canary on MenuItem + full app smoke (admin login,
-- signup transaction, magic-link start) before this migration shipped.
-- Idempotent: ENABLE on an already-enabled table is a no-op, so the
-- migration can be re-applied to a fresh DB cleanly.

ALTER TABLE "AuditLog"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BenchmarkSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillSplit"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompAction"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailTemplate"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackReport"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestNote"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestProfile"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestProfileOtp"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestSession"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LinkTokenUse"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuCategory"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuItem"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgMember"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAdmin"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformConfig"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreOrder"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Request"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reservation"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffMember"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Table"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TableAssignment"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TipPool"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TipPoolShare"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Venue"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VenueSpecial"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Waitlist"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent"      ENABLE ROW LEVEL SECURITY;
