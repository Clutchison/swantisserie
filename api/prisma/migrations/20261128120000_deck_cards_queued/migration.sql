-- A deck holds only picks and basic lands now, and shows its player's queue
-- (ADR 0020). In every draft not yet complete, the cards each player added
-- to their deck without picking them go to the end of their queue, in the
-- order Queue unpicked used with Include sideboard on: first those with a
-- queue order, the most recent departure first and each departure's cards
-- as they sat; then the rest, the mainboard's before the sideboard's, each
-- in the deck's order (by mana value, then name). Each keeps its board as its queued copy's board. A copy
-- already queued stays where it is, on its own board.
INSERT INTO "QueuedCard" ("id", "playerId", "poolCardId", "position", "board")
SELECT
  gen_random_uuid()::text,
  planned."playerId",
  planned."poolCardId",
  COALESCE(
    (SELECT MAX(queued."position") FROM "QueuedCard" queued
      WHERE queued."playerId" = planned."playerId"),
    -1
  ) + ROW_NUMBER() OVER (
    PARTITION BY planned."playerId"
    ORDER BY
      planned."queueDeparture" DESC NULLS LAST,
      planned."queuePosition" ASC,
      planned."board" ASC,
      card."manaValue" ASC,
      card."name" ASC,
      planned."poolCardId" ASC
  ),
  planned."board"
FROM "PlannedCard" planned
JOIN "PoolCard" card ON card."id" = planned."poolCardId"
JOIN "Player" player ON player."id" = planned."playerId"
JOIN "Draft" draft ON draft."id" = player."draftId"
WHERE planned."pickId" IS NULL
  AND draft."state" <> 'Complete'
  AND NOT EXISTS (
    SELECT 1 FROM "QueuedCard" queued
    WHERE queued."playerId" = planned."playerId"
      AND queued."poolCardId" = planned."poolCardId"
  );

-- Then those cards leave the decks, and the added cards they lost, which
-- the Deck notice listed, are forgotten: an undo of a pick that lost one
-- won't bring it back.
DELETE FROM "PlannedCard" planned
USING "Player" player, "Draft" draft
WHERE player."id" = planned."playerId"
  AND draft."id" = player."draftId"
  AND planned."pickId" IS NULL
  AND draft."state" <> 'Complete';

DELETE FROM "UnplannedCard" lost
USING "Player" player, "Draft" draft
WHERE player."id" = lost."playerId"
  AND draft."id" = player."draftId"
  AND draft."state" <> 'Complete';
