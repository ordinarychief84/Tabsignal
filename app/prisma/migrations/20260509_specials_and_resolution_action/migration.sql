-- Specials (manager-curated promotions) + resolution action tracking
-- on Request. All additive; no destructive ops.

-- CreateEnum: ResolutionAction
CREATE TYPE "ResolutionAction" AS ENUM ('SERVED', 'COMPED', 'REFUSED', 'ESCALATED', 'NOT_ACTIONABLE', 'OTHER');

-- AlterTable: Request — capture WHAT the staff member did at resolve-time.
ALTER TABLE "Request" ADD COLUMN "resolutionAction" "ResolutionAction";
ALTER TABLE "Request" ADD COLUMN "resolutionNote" TEXT;

-- CreateTable: VenueSpecial
CREATE TABLE "VenueSpecial" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueSpecial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueSpecial_venueId_active_startsAt_idx" ON "VenueSpecial"("venueId", "active", "startsAt");
CREATE INDEX "VenueSpecial_venueId_endsAt_idx" ON "VenueSpecial"("venueId", "endsAt");

-- AddForeignKey
ALTER TABLE "VenueSpecial" ADD CONSTRAINT "VenueSpecial_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
