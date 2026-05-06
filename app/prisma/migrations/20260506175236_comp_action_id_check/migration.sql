-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "idCheckRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "requireIdOnFirstDrink" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompAction" (
    "jti" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompAction_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "CompAction_sessionId_idx" ON "CompAction"("sessionId");

-- CreateIndex
CREATE INDEX "CompAction_venueId_appliedAt_idx" ON "CompAction"("venueId", "appliedAt");
