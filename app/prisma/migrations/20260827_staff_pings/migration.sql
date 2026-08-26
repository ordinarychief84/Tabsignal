-- One member of staff asking another for something, about a table.
--
-- DELIBERATELY NOT A MESSAGE. There is no body column, no thread, no
-- reply and no read receipt — a kind, a table, and who sent it. A server
-- mid-service should be able to raise this in two taps and get back to
-- the floor, and the moment it grows a text field it becomes a thing
-- people compose, which is the Slack-inside-TabCall the brief rules out.
--
-- Three kinds because three genuinely different asks were named: a pair
-- of hands, a decision, and a swap.
CREATE TYPE "StaffPingKind" AS ENUM ('NEED_HAND', 'NEED_MANAGER', 'NEED_COVER');

CREATE TABLE "StaffPing" (
  "id"           TEXT NOT NULL,
  "venueId"      TEXT NOT NULL,
  "fromStaffId"  TEXT NOT NULL,
  -- Null means the whole floor.
  "toStaffId"    TEXT,
  -- Null for an ask that isn't about one table.
  "tableId"      TEXT,
  "kind"         "StaffPingKind" NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredById" TEXT,
  "answeredAt"   TIMESTAMP(3),

  CONSTRAINT "StaffPing_pkey" PRIMARY KEY ("id")
);

-- The two reads: "what is open right now" and "what did the floor ask
-- for over this shift".
CREATE INDEX "StaffPing_venueId_createdAt_idx" ON "StaffPing"("venueId", "createdAt");
CREATE INDEX "StaffPing_venueId_answeredAt_idx" ON "StaffPing"("venueId", "answeredAt");

ALTER TABLE "StaffPing" ADD CONSTRAINT "StaffPing_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffPing" ADD CONSTRAINT "StaffPing_fromStaffId_fkey"
  FOREIGN KEY ("fromStaffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- The three nullable links SET NULL rather than cascade: a ping is a
-- record of what the floor asked for, and it should survive somebody
-- leaving or a table being renamed.
ALTER TABLE "StaffPing" ADD CONSTRAINT "StaffPing_toStaffId_fkey"
  FOREIGN KEY ("toStaffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffPing" ADD CONSTRAINT "StaffPing_answeredById_fkey"
  FOREIGN KEY ("answeredById") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffPing" ADD CONSTRAINT "StaffPing_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deny-by-default, like every other table here.
ALTER TABLE "StaffPing" ENABLE ROW LEVEL SECURITY;
