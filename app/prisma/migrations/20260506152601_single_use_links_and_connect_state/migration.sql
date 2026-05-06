-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LinkTokenUse" (
    "jti" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkTokenUse_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "LinkTokenUse_usedAt_idx" ON "LinkTokenUse"("usedAt");
