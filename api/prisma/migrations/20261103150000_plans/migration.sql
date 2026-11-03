-- CreateEnum
CREATE TYPE "PlanBoard" AS ENUM ('Mainboard', 'Sideboard');

-- CreateTable
CREATE TABLE "PlannedCard" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "poolCardId" TEXT NOT NULL,
    "pickId" TEXT NOT NULL,
    "board" "PlanBoard" NOT NULL DEFAULT 'Mainboard',

    CONSTRAINT "PlannedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannedCard_pickId_key" ON "PlannedCard"("pickId");

-- CreateIndex
CREATE INDEX "PlannedCard_poolCardId_idx" ON "PlannedCard"("poolCardId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedCard_playerId_poolCardId_key" ON "PlannedCard"("playerId", "poolCardId");

-- AddForeignKey
ALTER TABLE "PlannedCard" ADD CONSTRAINT "PlannedCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedCard" ADD CONSTRAINT "PlannedCard_poolCardId_fkey" FOREIGN KEY ("poolCardId") REFERENCES "PoolCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedCard" ADD CONSTRAINT "PlannedCard_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "Pick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every pick made so far is on its player's mainboard, as every pick from now on lands there.
INSERT INTO "PlannedCard" ("id", "playerId", "poolCardId", "pickId")
SELECT gen_random_uuid()::text, "playerId", "poolCardId", "id" FROM "Pick";
