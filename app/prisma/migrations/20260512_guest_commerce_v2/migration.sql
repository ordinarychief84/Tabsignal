-- Guest Commerce Module — spec-verbatim parallel schema.
-- Adds new tables alongside the existing flow (PreOrder, VenueSpecial,
-- legacy BillSplit on GuestSession). Existing data untouched.

-- ENUMS -----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "OrderItemStatus" AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "BillItemStatus" AS ENUM ('UNPAID', 'PAID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "BillSplitV2Status" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PromotionType" AS ENUM ('HAPPY_HOUR', 'BUSINESS_LUNCH', 'BANNER', 'LIMITED_TIME_ITEM', 'NEW_ITEM', 'DISCOUNT_HIGHLIGHT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PromotionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "WishlistStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PosIntegrationStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- COLUMN ADDS ----------------------------------------------------------

ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "MenuItem_venueId_isFeatured_idx" ON "MenuItem"("venueId", "isFeatured");

-- TABLES ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Order" (
  "id"             TEXT NOT NULL,
  "venueId"        TEXT NOT NULL,
  "tableId"        TEXT,
  "guestSessionId" TEXT,
  "status"         "OrderStatus" NOT NULL DEFAULT 'NEW',
  "subtotalCents"  INTEGER NOT NULL,
  "taxCents"       INTEGER NOT NULL DEFAULT 0,
  "serviceCents"   INTEGER NOT NULL DEFAULT 0,
  "tipCents"       INTEGER NOT NULL DEFAULT 0,
  "totalCents"     INTEGER NOT NULL,
  "posReference"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Order_venueId_status_createdAt_idx" ON "Order"("venueId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_guestSessionId_idx" ON "Order"("guestSessionId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id"           TEXT NOT NULL,
  "orderId"      TEXT NOT NULL,
  "menuItemId"   TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "priceCents"   INTEGER NOT NULL,
  "quantity"     INTEGER NOT NULL DEFAULT 1,
  "notes"        TEXT,
  "status"       "OrderItemStatus" NOT NULL DEFAULT 'NEW',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Bill" (
  "id"              TEXT NOT NULL,
  "venueId"         TEXT NOT NULL,
  "tableId"         TEXT,
  "orderId"         TEXT,
  "status"          "BillStatus" NOT NULL DEFAULT 'OPEN',
  "subtotalCents"   INTEGER NOT NULL,
  "taxCents"        INTEGER NOT NULL DEFAULT 0,
  "serviceCents"    INTEGER NOT NULL DEFAULT 0,
  "tipTotalCents"   INTEGER NOT NULL DEFAULT 0,
  "totalCents"      INTEGER NOT NULL,
  "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
  "amountDueCents"  INTEGER NOT NULL,
  "posReference"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Bill_orderId_key" UNIQUE ("orderId")
);
CREATE INDEX IF NOT EXISTS "Bill_venueId_status_createdAt_idx" ON "Bill"("venueId", "status", "createdAt");
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BillItem" (
  "id"            TEXT NOT NULL,
  "billId"        TEXT NOT NULL,
  "orderItemId"   TEXT,
  "nameSnapshot"  TEXT NOT NULL,
  "priceCents"    INTEGER NOT NULL,
  "quantity"      INTEGER NOT NULL,
  "status"        "BillItemStatus" NOT NULL DEFAULT 'UNPAID',
  "paidBySplitId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillItem_orderItemId_key" UNIQUE ("orderItemId")
);
CREATE INDEX IF NOT EXISTS "BillItem_billId_status_idx" ON "BillItem"("billId", "status");
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BillSplitV2" (
  "id"                    TEXT NOT NULL,
  "billId"                TEXT NOT NULL,
  "guestSessionId"        TEXT,
  "status"                "BillSplitV2Status" NOT NULL DEFAULT 'PENDING',
  "subtotalCents"         INTEGER NOT NULL,
  "taxCents"              INTEGER NOT NULL DEFAULT 0,
  "serviceCents"          INTEGER NOT NULL DEFAULT 0,
  "tipCents"              INTEGER NOT NULL DEFAULT 0,
  "totalCents"            INTEGER NOT NULL,
  "paymentReference"      TEXT,
  "stripePaymentIntentId" TEXT,
  "paidAt"                TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillSplitV2_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BillSplitV2_billId_status_idx" ON "BillSplitV2"("billId", "status");
CREATE INDEX IF NOT EXISTS "BillSplitV2_stripePaymentIntentId_idx" ON "BillSplitV2"("stripePaymentIntentId");
ALTER TABLE "BillSplitV2" ADD CONSTRAINT "BillSplitV2_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillSplitV2" ADD CONSTRAINT "BillSplitV2_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_paidBySplitId_fkey" FOREIGN KEY ("paidBySplitId") REFERENCES "BillSplitV2"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BillSplitItem" (
  "id"          TEXT NOT NULL,
  "billSplitId" TEXT NOT NULL,
  "billItemId"  TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillSplitItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillSplitItem_billSplitId_billItemId_key" UNIQUE ("billSplitId", "billItemId")
);
ALTER TABLE "BillSplitItem" ADD CONSTRAINT "BillSplitItem_billSplitId_fkey" FOREIGN KEY ("billSplitId") REFERENCES "BillSplitV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillSplitItem" ADD CONSTRAINT "BillSplitItem_billItemId_fkey" FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Promotion" (
  "id"             TEXT NOT NULL,
  "venueId"        TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "type"           "PromotionType" NOT NULL,
  "bannerImageUrl" TEXT,
  "startsAt"       TIMESTAMP(3),
  "endsAt"         TIMESTAMP(3),
  "status"         "PromotionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Promotion_venueId_status_startsAt_idx" ON "Promotion"("venueId", "status", "startsAt");
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PromotionItem" (
  "id"          TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "menuItemId"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionItem_promotionId_menuItemId_key" UNIQUE ("promotionId", "menuItemId")
);
CREATE INDEX IF NOT EXISTS "PromotionItem_menuItemId_idx" ON "PromotionItem"("menuItemId");
ALTER TABLE "PromotionItem" ADD CONSTRAINT "PromotionItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionItem" ADD CONSTRAINT "PromotionItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Wishlist" (
  "id"                TEXT NOT NULL,
  "venueId"           TEXT NOT NULL,
  "tableId"           TEXT,
  "guestSessionId"    TEXT NOT NULL,
  "status"            "WishlistStatus" NOT NULL DEFAULT 'ACTIVE',
  "sharedWithStaffAt" TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Wishlist_guestSessionId_key" UNIQUE ("guestSessionId")
);
CREATE INDEX IF NOT EXISTS "Wishlist_venueId_status_idx" ON "Wishlist"("venueId", "status");
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "WishlistItem" (
  "id"         TEXT NOT NULL,
  "wishlistId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "quantity"   INTEGER NOT NULL DEFAULT 1,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WishlistItem_wishlistId_menuItemId_key" UNIQUE ("wishlistId", "menuItemId")
);
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "VenueBranding" (
  "id"             TEXT NOT NULL,
  "venueId"        TEXT NOT NULL,
  "logoUrl"        TEXT,
  "primaryColor"   TEXT,
  "secondaryColor" TEXT,
  "accentColor"    TEXT,
  "fontFamily"     TEXT,
  "welcomeMessage" TEXT,
  "bannerImageUrl" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VenueBranding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VenueBranding_venueId_key" UNIQUE ("venueId")
);
ALTER TABLE "VenueBranding" ADD CONSTRAINT "VenueBranding_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PosIntegration" (
  "id"                   TEXT NOT NULL,
  "venueId"              TEXT NOT NULL,
  "provider"             TEXT NOT NULL,
  "status"               "PosIntegrationStatus" NOT NULL DEFAULT 'PENDING',
  "encryptedCredentials" TEXT,
  "lastSyncAt"           TIMESTAMP(3),
  "lastError"            TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosIntegration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PosIntegration_venueId_key" UNIQUE ("venueId")
);
CREATE INDEX IF NOT EXISTS "PosIntegration_provider_status_idx" ON "PosIntegration"("provider", "status");
ALTER TABLE "PosIntegration" ADD CONSTRAINT "PosIntegration_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PosSyncLog" (
  "id"                  TEXT NOT NULL,
  "venueId"             TEXT NOT NULL,
  "provider"            TEXT NOT NULL,
  "action"              TEXT NOT NULL,
  "status"              TEXT NOT NULL,
  "requestPayloadSafe"  JSONB,
  "responsePayloadSafe" JSONB,
  "errorMessage"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosSyncLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PosSyncLog_venueId_createdAt_idx" ON "PosSyncLog"("venueId", "createdAt");
ALTER TABLE "PosSyncLog" ADD CONSTRAINT "PosSyncLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
