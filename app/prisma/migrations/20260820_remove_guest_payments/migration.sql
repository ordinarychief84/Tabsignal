-- Remove guest payments and sales tax.
--
-- TabCall no longer takes money from guests: they settle with staff on the
-- venue's own terminal, which is also where tax and tipping happen. Every
-- table and column below existed only to move or account for guest money.
--
-- Safe to drop: all of these were verified empty in production before this
-- migration was written (0 rows in PreOrder, BillSplit, Bill, BillItem,
-- BillSplitV2, BillSplitItem; 0 venues with a Stripe account or tax rate;
-- 0 sessions with a PaymentIntent).
--
-- GuestSession.paidAt is deliberately KEPT. It means "tab closed out"
-- rather than "card charged", and Regulars, tip pools and the session
-- export all key off it — it is the hook a future staff "mark settled"
-- action will set.

-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_guestSessionId_fkey";

-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_tableId_fkey";

-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_venueId_fkey";

-- DropForeignKey
ALTER TABLE "BillItem" DROP CONSTRAINT "BillItem_billId_fkey";

-- DropForeignKey
ALTER TABLE "BillItem" DROP CONSTRAINT "BillItem_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "BillItem" DROP CONSTRAINT "BillItem_paidBySplitId_fkey";

-- DropForeignKey
ALTER TABLE "BillSplit" DROP CONSTRAINT "BillSplit_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "BillSplitItem" DROP CONSTRAINT "BillSplitItem_billItemId_fkey";

-- DropForeignKey
ALTER TABLE "BillSplitItem" DROP CONSTRAINT "BillSplitItem_billSplitId_fkey";

-- DropForeignKey
ALTER TABLE "BillSplitV2" DROP CONSTRAINT "BillSplitV2_billId_fkey";

-- DropForeignKey
ALTER TABLE "BillSplitV2" DROP CONSTRAINT "BillSplitV2_guestSessionId_fkey";

-- DropForeignKey
ALTER TABLE "PreOrder" DROP CONSTRAINT "PreOrder_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "PreOrder" DROP CONSTRAINT "PreOrder_tableId_fkey";

-- DropForeignKey
ALTER TABLE "PreOrder" DROP CONSTRAINT "PreOrder_venueId_fkey";

-- AlterTable
ALTER TABLE "GuestSession" DROP COLUMN "stripePaymentIntentId",
DROP COLUMN "tipPercent";

-- AlterTable
ALTER TABLE "Venue" DROP COLUMN "stripeAccountId",
DROP COLUMN "stripeChargesEnabled",
DROP COLUMN "stripeDetailsSubmitted",
DROP COLUMN "stripePayoutsEnabled",
DROP COLUMN "taxRateBps";

-- DropTable
DROP TABLE "Bill";

-- DropTable
DROP TABLE "BillItem";

-- DropTable
DROP TABLE "BillSplit";

-- DropTable
DROP TABLE "BillSplitItem";

-- DropTable
DROP TABLE "BillSplitV2";

-- DropTable
DROP TABLE "PreOrder";

-- DropEnum
DROP TYPE "BillItemStatus";

-- DropEnum
DROP TYPE "BillSplitV2Status";

-- DropEnum
DROP TYPE "BillStatus";

-- DropEnum
DROP TYPE "PreOrderStatus";

-- Unrelated to the removal, but fixed here rather than left to reappear in
-- every future migration diff: schema.prisma has always declared this
-- relation and neither the production nor the development database had the
-- constraint. GoogleReview is empty in production, so adding it is a no-op
-- against existing rows.
ALTER TABLE "GoogleReview" ADD CONSTRAINT "GoogleReview_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
