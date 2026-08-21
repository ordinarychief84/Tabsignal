-- CreateEnum
CREATE TYPE "MarketingConsentStatus" AS ENUM ('PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CampaignAudience" AS ENUM ('ALL_SUBSCRIBED', 'VISITED_LAST_30_DAYS', 'RETURNING_GUESTS');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestType" ADD VALUE 'ORDER';
ALTER TYPE "RequestType" ADD VALUE 'CELEBRATION';

-- AlterTable
ALTER TABLE "FeedbackReport" ADD COLUMN     "guestContactId" TEXT,
ADD COLUMN     "managerRecoveryRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recoveryResolvedAt" TIMESTAMP(3),
ADD COLUMN     "recoveryResolvedById" TEXT,
ADD COLUMN     "sentiment" TEXT;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "routedAt" TIMESTAMP(3),
ADD COLUMN     "routingChannel" TEXT;

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "welcomeMessage" TEXT;

-- CreateTable
CREATE TABLE "GuestContact" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingConsent" (
    "id" TEXT NOT NULL,
    "guestContactId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "status" "MarketingConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consentTextVersion" TEXT,
    "consentSource" TEXT,
    "consentedAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestVisit" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT,
    "guestSessionId" TEXT NOT NULL,
    "guestContactId" TEXT,
    "assignedServerId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackTag" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audienceType" "CampaignAudience" NOT NULL DEFAULT 'ALL_SUBSCRIBED',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "guestContactId" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestContact_venueId_lastSeenAt_idx" ON "GuestContact"("venueId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestContact_venueId_phone_key" ON "GuestContact"("venueId", "phone");

-- CreateIndex
CREATE INDEX "MarketingConsent_venueId_status_idx" ON "MarketingConsent"("venueId", "status");

-- CreateIndex
CREATE INDEX "MarketingConsent_guestContactId_idx" ON "MarketingConsent"("guestContactId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestVisit_guestSessionId_key" ON "GuestVisit"("guestSessionId");

-- CreateIndex
CREATE INDEX "GuestVisit_venueId_startedAt_idx" ON "GuestVisit"("venueId", "startedAt");

-- CreateIndex
CREATE INDEX "GuestVisit_guestContactId_idx" ON "GuestVisit"("guestContactId");

-- CreateIndex
CREATE INDEX "FeedbackTag_tag_idx" ON "FeedbackTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackTag_feedbackId_tag_key" ON "FeedbackTag"("feedbackId", "tag");

-- CreateIndex
CREATE INDEX "Campaign_venueId_status_idx" ON "Campaign"("venueId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_guestContactId_key" ON "CampaignRecipient"("campaignId", "guestContactId");

-- CreateIndex
CREATE INDEX "FeedbackReport_venueId_managerRecoveryRequested_recoveryRes_idx" ON "FeedbackReport"("venueId", "managerRecoveryRequested", "recoveryResolvedAt");

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_guestContactId_fkey" FOREIGN KEY ("guestContactId") REFERENCES "GuestContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestContact" ADD CONSTRAINT "GuestContact_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_guestContactId_fkey" FOREIGN KEY ("guestContactId") REFERENCES "GuestContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestVisit" ADD CONSTRAINT "GuestVisit_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestVisit" ADD CONSTRAINT "GuestVisit_guestContactId_fkey" FOREIGN KEY ("guestContactId") REFERENCES "GuestContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTag" ADD CONSTRAINT "FeedbackTag_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "FeedbackReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_guestContactId_fkey" FOREIGN KEY ("guestContactId") REFERENCES "GuestContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security.
--
-- Supabase's PostgREST exposes /rest/v1/<table> to anyone holding the anon
-- key, which the browser publishes. These six tables are the most
-- sensitive in the product — guest phone numbers, consent records and the
-- send lists built from them — so they get the same deny-by-default
-- posture as every other table: RLS on, no permissive policies. Prisma
-- connects through a BYPASSRLS role, so app traffic is unaffected and REST
-- gets nothing.
ALTER TABLE "GuestContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignRecipient" ENABLE ROW LEVEL SECURITY;
