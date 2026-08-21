-- Two more floor signals: CLEAN and SUPPLIES.
--
-- Salvaged from PR #42/#55's request-vocabulary work, which sat unmerged
-- since May. Its FOOD and MANAGER values are deliberately NOT taken:
-- ORDER already covers "ready to order", and asking for a manager now
-- runs through the service-recovery flow, which carries the rating and
-- reason with it. Adding near-duplicates would split the analytics for no
-- gain on the floor.
--
-- These two are genuinely distinct work: both can be handed to a runner
-- rather than pulling the assigned server off another table.
--
-- ADD VALUE is online in Postgres (no table rewrite), and IF NOT EXISTS
-- keeps it re-runnable. The values are added but not USED in this
-- migration, which is what makes it safe inside a transaction.
ALTER TYPE "RequestType" ADD VALUE IF NOT EXISTS 'CLEAN';
ALTER TYPE "RequestType" ADD VALUE IF NOT EXISTS 'SUPPLIES';
