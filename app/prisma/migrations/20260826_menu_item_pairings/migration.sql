-- Venue-authored "pairs well with" suggestions between menu items.
--
-- AUTHORED, NEVER INFERRED. TabCall has no basket, no bill and no
-- transaction history, so it cannot know what actually gets ordered
-- together — anything it claimed about that would be invented. A chef
-- knows which wine goes with the pork, and this is where they say so.
--
-- The relationship is the copy: each value produces a different sentence
-- in front of a guest ("Pairs well with" vs "Goes down well after"), so
-- these are not interchangeable labels.
CREATE TYPE "PairingRelationship" AS ENUM (
  'PAIRS_WITH',
  'POPULAR_WITH',
  'COMPLETE_MEAL',
  'RECOMMENDED_DRINK',
  'RECOMMENDED_DESSERT'
);

CREATE TABLE "MenuItemPairing" (
  "id"           TEXT NOT NULL,
  "venueId"      TEXT NOT NULL,
  "menuItemId"   TEXT NOT NULL,
  "suggestedId"  TEXT NOT NULL,
  "relationship" "PairingRelationship" NOT NULL DEFAULT 'PAIRS_WITH',
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MenuItemPairing_pkey" PRIMARY KEY ("id")
);

-- One suggestion per direction per pair. Stops a venue stacking three
-- copies of the same recommendation on one dish.
CREATE UNIQUE INDEX "MenuItemPairing_menuItemId_suggestedId_key"
  ON "MenuItemPairing"("menuItemId", "suggestedId");
CREATE INDEX "MenuItemPairing_venueId_idx" ON "MenuItemPairing"("venueId");
CREATE INDEX "MenuItemPairing_menuItemId_idx" ON "MenuItemPairing"("menuItemId");

-- Cascades from every side: deleting a venue or either dish removes the
-- suggestion rather than leaving a row pointing at nothing.
ALTER TABLE "MenuItemPairing" ADD CONSTRAINT "MenuItemPairing_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItemPairing" ADD CONSTRAINT "MenuItemPairing_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItemPairing" ADD CONSTRAINT "MenuItemPairing_suggestedId_fkey"
  FOREIGN KEY ("suggestedId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: the repo denies by default and has a coverage test
-- that fails on any table without it. Guests read pairings through the
-- server only, which connects as the app role.
ALTER TABLE "MenuItemPairing" ENABLE ROW LEVEL SECURITY;
