-- Phase 2 schema: menu management, bill split, tip pool, SaaS subscription, pre-order.
-- Bundled into a single migration so deploys roll all features atomically.

-- ============================================================================
-- New enums
-- ============================================================================

CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "PreOrderStatus" AS ENUM ('PENDING', 'READY', 'PICKED_UP', 'CANCELED');
CREATE TYPE "TipPoolPeriod" AS ENUM ('SHIFT', 'DAY', 'WEEK');

-- ============================================================================
-- Organization: add subscription tracking columns
-- ============================================================================

ALTER TABLE "Organization"
  ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "subscriptionPriceId" TEXT,
  ADD COLUMN "subscriptionPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- ============================================================================
-- Menu management
-- ============================================================================

CREATE TABLE "MenuCategory" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MenuCategory_venueId_idx" ON "MenuCategory"("venueId");

ALTER TABLE "MenuCategory"
  ADD CONSTRAINT "MenuCategory_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MenuItem" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "imageUrl" TEXT,
  "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MenuItem_venueId_isActive_idx" ON "MenuItem"("venueId", "isActive");
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Bill split
-- ============================================================================

CREATE TABLE "BillSplit" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "label" TEXT,
  "amountCents" INTEGER NOT NULL,
  "tipPercent" DOUBLE PRECISION NOT NULL,
  "stripePaymentIntentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillSplit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillSplit_sessionId_idx" ON "BillSplit"("sessionId");
CREATE INDEX "BillSplit_stripePaymentIntentId_idx" ON "BillSplit"("stripePaymentIntentId");

ALTER TABLE "BillSplit"
  ADD CONSTRAINT "BillSplit_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Pre-order
-- ============================================================================

CREATE TABLE "PreOrder" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "tableId" TEXT,
  "sessionId" TEXT,
  "status" "PreOrderStatus" NOT NULL DEFAULT 'PENDING',
  "items" JSONB NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  "tipCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL,
  "stripePaymentIntentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "guestName" TEXT,
  "guestPhone" TEXT,
  "pickupCode" TEXT,
  "notes" TEXT,
  "readyAt" TIMESTAMP(3),
  "pickedUpAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PreOrder_venueId_status_idx" ON "PreOrder"("venueId", "status");
CREATE INDEX "PreOrder_sessionId_idx" ON "PreOrder"("sessionId");

ALTER TABLE "PreOrder"
  ADD CONSTRAINT "PreOrder_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreOrder"
  ADD CONSTRAINT "PreOrder_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PreOrder"
  ADD CONSTRAINT "PreOrder_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Tip pool + shares
-- ============================================================================

CREATE TABLE "TipPool" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "period" "TipPoolPeriod" NOT NULL DEFAULT 'SHIFT',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "totalTipsCents" INTEGER NOT NULL DEFAULT 0,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TipPool_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TipPool_venueId_startedAt_idx" ON "TipPool"("venueId", "startedAt");

ALTER TABLE "TipPool"
  ADD CONSTRAINT "TipPool_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TipPoolShare" (
  "id" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "staffMemberId" TEXT NOT NULL,
  "shareWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "payoutCents" INTEGER NOT NULL DEFAULT 0,
  "paidOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TipPoolShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TipPoolShare_poolId_staffMemberId_key" ON "TipPoolShare"("poolId", "staffMemberId");
CREATE INDEX "TipPoolShare_staffMemberId_idx" ON "TipPoolShare"("staffMemberId");

ALTER TABLE "TipPoolShare"
  ADD CONSTRAINT "TipPoolShare_poolId_fkey"
  FOREIGN KEY ("poolId") REFERENCES "TipPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
