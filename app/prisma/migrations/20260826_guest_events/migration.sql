-- Guest product analytics.
--
-- NO PII, BY CONSTRUCTION. There is deliberately no column here that
-- could hold a name, a phone number, a device id or an IP — only a
-- venue, a session, a verb, and optionally which menu item or promotion
-- it was about. That is a schema-level guarantee rather than a
-- discipline someone has to remember at every call site.
--
-- The session id is included so a funnel can be followed within one
-- visit. It is already a random per-visit token that expires in eight
-- hours and is not tied to a person unless that guest chose to leave a
-- number.
--
-- Append-only. Aggregates are computed at read time; there are no
-- running counters to drift out of step with the rows.
CREATE TABLE "GuestEvent" (
  "id"          TEXT NOT NULL,
  "venueId"     TEXT NOT NULL,
  "sessionId"   TEXT,
  "type"        TEXT NOT NULL,
  "menuItemId"  TEXT,
  "promotionId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestEvent_pkey" PRIMARY KEY ("id")
);

-- The two shapes every read uses: "how many X this period" and
-- "everything this period". Plus session, for walking one visit.
CREATE INDEX "GuestEvent_venueId_type_createdAt_idx"
  ON "GuestEvent"("venueId", "type", "createdAt");
CREATE INDEX "GuestEvent_venueId_createdAt_idx"
  ON "GuestEvent"("venueId", "createdAt");
CREATE INDEX "GuestEvent_sessionId_idx" ON "GuestEvent"("sessionId");

ALTER TABLE "GuestEvent" ADD CONSTRAINT "GuestEvent_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- menuItemId and promotionId are deliberately NOT foreign keys. Deleting
-- a dish should not erase the history of guests having looked at it, and
-- an analytics row that outlives its subject is correct rather than
-- broken — the reader joins by id and shows what it can resolve.

-- Deny-by-default, like every other table here.
ALTER TABLE "GuestEvent" ENABLE ROW LEVEL SECURITY;
