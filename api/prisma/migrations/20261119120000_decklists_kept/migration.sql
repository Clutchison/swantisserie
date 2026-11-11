-- AlterTable: no tournament already there gets a completion time (ADR 0017).
ALTER TABLE "Tournament" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Every deck is now kept at Start (ADR 0017). A playing tournament's decks
-- are locked, so each entry without a snapshot gets its player's deck as it
-- is now, as Start would have kept it: each board's cards by mana value then
-- name, and the basics in the order the lands are declared. Registration
-- tournaments snapshot at Start; complete ones keep no decklists.
UPDATE "TournamentEntry" AS e
SET "decklist" = jsonb_build_object(
  'mainboard', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('poolCardId', p."poolCardId", 'name', c."name", 'picked', p."pickId" IS NOT NULL)
      ORDER BY c."manaValue", c."name"
    )
    FROM "PlannedCard" AS p JOIN "PoolCard" AS c ON c."id" = p."poolCardId"
    WHERE p."playerId" = e."playerId" AND p."board" = 'Mainboard'
  ), '[]'::jsonb),
  'sideboard', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('poolCardId', p."poolCardId", 'name', c."name", 'picked', p."pickId" IS NOT NULL)
      ORDER BY c."manaValue", c."name"
    )
    FROM "PlannedCard" AS p JOIN "PoolCard" AS c ON c."id" = p."poolCardId"
    WHERE p."playerId" = e."playerId" AND p."board" = 'Sideboard'
  ), '[]'::jsonb),
  'basics', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('land', b."land", 'count', b."count") ORDER BY b."land")
    FROM "PlannedBasic" AS b
    WHERE b."playerId" = e."playerId"
  ), '[]'::jsonb)
)
FROM "Tournament" AS t
WHERE t."id" = e."tournamentId" AND t."state" = 'Playing' AND e."decklist" IS NULL;
