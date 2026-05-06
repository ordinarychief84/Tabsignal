-- CreateTable
CREATE TABLE "TableAssignment" (
    "tableId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableAssignment_pkey" PRIMARY KEY ("tableId","staffMemberId")
);

-- CreateIndex
CREATE INDEX "TableAssignment_staffMemberId_idx" ON "TableAssignment"("staffMemberId");

-- AddForeignKey
ALTER TABLE "TableAssignment" ADD CONSTRAINT "TableAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableAssignment" ADD CONSTRAINT "TableAssignment_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
