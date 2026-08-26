-- Split "I've seen it" from "I'm walking over".
--
-- The request lifecycle was PENDING → ACKNOWLEDGED → RESOLVED, and the
-- guest app read ACKNOWLEDGED as "Sarah is on the way". Those are
-- different promises. A server tapping "Got it" while carrying three
-- plates has seen the request; they are not crossing the room. A guest
-- told otherwise stops watching the door and waits longer before asking
-- again, which makes the service worse than saying nothing.
--
-- ON_MY_WAY sits between them. Nothing is migrated: every existing
-- ACKNOWLEDGED row stays ACKNOWLEDGED, which is exactly what it meant
-- when it was written. Backfilling them to ON_MY_WAY would invent a
-- moment that never happened and corrupt response-time history.
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'ON_MY_WAY' AFTER 'ACKNOWLEDGED';

-- Separate column, never overwriting acknowledgedAt. The gap between the
-- two is the number that tells a manager whether requests are being
-- claimed and then sat on — collapsing them into one timestamp would
-- destroy the only evidence of that.
ALTER TABLE "Request" ADD COLUMN "onMyWayAt" TIMESTAMP(3);
