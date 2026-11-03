-- Relies on the pool backfill having filled in every pool card's layout,
-- rarity and faces. If any is still null, this one statement fails, so the
-- migration changes nothing.
ALTER TABLE "PoolCard"
  ALTER COLUMN "layout" SET NOT NULL,
  ALTER COLUMN "rarity" SET NOT NULL,
  ALTER COLUMN "faces" SET NOT NULL;
