-- Discovery tags on menu items.
--
-- Drives the "what are you in the mood for?" prompts. Deterministic by
-- design: the venue decides what counts as "light" or "bold", so the
-- feature costs nothing per scan, works offline, and can be explained to
-- an owner in one sentence.
--
-- Empty default, so every existing item is valid immediately and a venue
-- that never tags anything simply doesn't get the discovery row.
ALTER TABLE "MenuItem" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
