-- Where a staff member is right now, as opposed to whether they still
-- work here.
--
-- StaffStatus already answers "are they employed and able to sign in".
-- This answers "should the next request at their table go to them".
-- Conflating the two would mean a server stepping outside for ten
-- minutes looks fired, and suspending someone would need to be undone
-- every time they came back from lunch.
CREATE TYPE "ShiftStatus" AS ENUM ('ON_SHIFT', 'BREAK', 'MEAL_BREAK', 'OFF_SHIFT');

-- Defaults to OFF_SHIFT, including for every existing row. A staff
-- member who has never opened the app has not started a shift, and
-- defaulting the other way would route live guest requests to people who
-- aren't there — which is worse than the current behaviour, not better.
--
-- Routing degrades safely: a table whose assigned staff are all away
-- still reaches them rather than going silent. See lib/routing.
ALTER TABLE "StaffMember"
  ADD COLUMN "shiftStatus" "ShiftStatus" NOT NULL DEFAULT 'OFF_SHIFT',
  ADD COLUMN "shiftStartedAt" TIMESTAMP(3);
