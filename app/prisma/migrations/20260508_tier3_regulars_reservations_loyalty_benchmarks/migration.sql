-- Tier 3 + regulars dossier (T3a multi-location, T3b reservations, T3c loyalty,
-- T3d benchmarking, T3e regulars). All additive — no destructive ops.

-- CreateEnum
CREATE TYPE "OrgMemberRole" AS ENUM ('OWNER', 'ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'ARRIVED', 'SEATED', 'NO_SHOW', 'CANCELED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'SEATED', 'ABANDONED');

-- AlterTable: Venue.regionTag for multi-location grouping
ALTER TABLE "Venue" ADD COLUMN "regionTag" TEXT;

-- AlterTable: GuestSession.guestProfileId for loyalty + regulars dossier pairing
ALTER TABLE "GuestSession" ADD COLUMN "guestProfileId" TEXT;

-- CreateTable: OrgMember (T3a)
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Reservation (T3b)
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT,
    "zone" TEXT,
    "partySize" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "guestCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Waitlist (T3b)
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "quotedWaitMin" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GuestProfile (T3c loyalty + T3e regulars)
CREATE TABLE "GuestProfile" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "loyaltyPointsByVenueId" JSONB NOT NULL DEFAULT '{}',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GuestNote (T3e regulars dossier)
CREATE TABLE "GuestNote" (
    "id" TEXT NOT NULL,
    "guestProfileId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "authorStaffId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GuestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GuestProfileOtp (T3c loyalty OTP)
CREATE TABLE "GuestProfileOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestProfileOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BenchmarkSnapshot (T3d)
CREATE TABLE "BenchmarkSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "segmentKey" TEXT NOT NULL,
    "segmentJson" JSONB NOT NULL,
    "metric" TEXT NOT NULL,
    "p25" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p75" DOUBLE PRECISION NOT NULL,
    "p90" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: GuestSession.guestProfileId
CREATE INDEX "GuestSession_guestProfileId_idx" ON "GuestSession"("guestProfileId");

-- CreateIndex: OrgMember
CREATE INDEX "OrgMember_email_idx" ON "OrgMember"("email");
CREATE UNIQUE INDEX "OrgMember_orgId_email_key" ON "OrgMember"("orgId", "email");

-- CreateIndex: Reservation
CREATE INDEX "Reservation_venueId_startsAt_idx" ON "Reservation"("venueId", "startsAt");
CREATE INDEX "Reservation_guestPhone_idx" ON "Reservation"("guestPhone");

-- CreateIndex: Waitlist
CREATE INDEX "Waitlist_venueId_joinedAt_idx" ON "Waitlist"("venueId", "joinedAt");

-- CreateIndex: GuestProfile
CREATE UNIQUE INDEX "GuestProfile_phone_key" ON "GuestProfile"("phone");
CREATE UNIQUE INDEX "GuestProfile_email_key" ON "GuestProfile"("email");

-- CreateIndex: GuestNote
CREATE INDEX "GuestNote_guestProfileId_venueId_idx" ON "GuestNote"("guestProfileId", "venueId");
CREATE INDEX "GuestNote_venueId_createdAt_idx" ON "GuestNote"("venueId", "createdAt");

-- CreateIndex: GuestProfileOtp
CREATE INDEX "GuestProfileOtp_phone_createdAt_idx" ON "GuestProfileOtp"("phone", "createdAt");

-- CreateIndex: BenchmarkSnapshot
CREATE INDEX "BenchmarkSnapshot_date_metric_idx" ON "BenchmarkSnapshot"("date", "metric");
CREATE UNIQUE INDEX "BenchmarkSnapshot_date_metric_segmentKey_key" ON "BenchmarkSnapshot"("date", "metric", "segmentKey");

-- AddForeignKey: GuestSession → GuestProfile
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: OrgMember → Organization
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Reservation → Venue, Table
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Waitlist → Venue
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: GuestNote → GuestProfile
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
