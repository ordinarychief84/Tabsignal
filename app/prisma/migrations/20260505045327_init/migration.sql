-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'FLAT', 'FOUNDING');

-- CreateEnum
CREATE TYPE "PosType" AS ENUM ('NONE', 'TOAST', 'SQUARE', 'CLOVER');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('STAFF');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('DRINK', 'BILL', 'HELP', 'REFILL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FOUNDING',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "zipCode" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "posType" "PosType" NOT NULL DEFAULT 'NONE',
    "posWebhookUrl" TEXT,
    "googlePlaceId" TEXT,
    "stripeAccountId" TEXT,
    "brandColor" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "zone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "tipPercent" DOUBLE PRECISION,
    "paidAt" TIMESTAMP(3),
    "stripePaymentIntentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackReport" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "aiCategory" TEXT,
    "aiSuggestion" TEXT,
    "aiServerName" TEXT,
    "seenByMgr" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE INDEX "Venue_orgId_idx" ON "Venue"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_qrToken_key" ON "Table"("qrToken");

-- CreateIndex
CREATE INDEX "Table_venueId_idx" ON "Table"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_venueId_label_key" ON "Table"("venueId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_email_key" ON "StaffMember"("email");

-- CreateIndex
CREATE INDEX "StaffMember_venueId_idx" ON "StaffMember"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_sessionToken_key" ON "GuestSession"("sessionToken");

-- CreateIndex
CREATE INDEX "GuestSession_venueId_tableId_idx" ON "GuestSession"("venueId", "tableId");

-- CreateIndex
CREATE INDEX "GuestSession_expiresAt_idx" ON "GuestSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Request_venueId_status_idx" ON "Request"("venueId", "status");

-- CreateIndex
CREATE INDEX "Request_sessionId_idx" ON "Request"("sessionId");

-- CreateIndex
CREATE INDEX "WebhookEvent_type_receivedAt_idx" ON "WebhookEvent"("type", "receivedAt");

-- CreateIndex
CREATE INDEX "FeedbackReport_venueId_createdAt_idx" ON "FeedbackReport"("venueId", "createdAt");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
