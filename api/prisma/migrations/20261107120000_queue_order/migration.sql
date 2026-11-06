-- AlterTable: no departures yet, so no plan card has a queue order. No backfill.
ALTER TABLE "Player" ADD COLUMN "lastQueueDeparture" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlannedCard" ADD COLUMN "queueDeparture" INTEGER,
ADD COLUMN "queuePosition" INTEGER;
