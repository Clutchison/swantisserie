-- A deck holds only picks and basic lands (ADR 0020), so what only cards
-- added to it unpicked needed goes: the cards lost from decks, which the
-- Deck notice listed; whether a card was added to the deck before it was
-- picked; queue order, and the departure counter that keyed it.
--
-- A pick of an added card undone since the previous migration stayed in
-- its deck without its pick, unshown; it goes too.
DELETE FROM "PlannedCard" WHERE "pickId" IS NULL;

-- Every deck card is now a pick, and undoing the pick takes it out of the
-- deck.
ALTER TABLE "PlannedCard" ALTER COLUMN "pickId" SET NOT NULL;
ALTER TABLE "PlannedCard" DROP CONSTRAINT "PlannedCard_pickId_fkey";
ALTER TABLE "PlannedCard" ADD CONSTRAINT "PlannedCard_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "Pick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "UnplannedCard";

ALTER TABLE "PlannedCard"
  DROP COLUMN "added",
  DROP COLUMN "queueDeparture",
  DROP COLUMN "queuePosition";

ALTER TABLE "Player" DROP COLUMN "lastQueueDeparture";
