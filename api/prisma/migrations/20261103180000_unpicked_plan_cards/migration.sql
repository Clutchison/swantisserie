-- DropForeignKey
ALTER TABLE "PlannedCard" DROP CONSTRAINT "PlannedCard_pickId_fkey";

-- AlterTable
ALTER TABLE "PlannedCard" ADD COLUMN     "added" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "pickId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UnplannedCard" (
    "id" TEXT NOT NULL,
    "pickId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "poolCardId" TEXT NOT NULL,
    "board" "PlanBoard" NOT NULL,
    "noticeHidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UnplannedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnplannedCard_playerId_idx" ON "UnplannedCard"("playerId");

-- CreateIndex
CREATE INDEX "UnplannedCard_poolCardId_idx" ON "UnplannedCard"("poolCardId");

-- CreateIndex
CREATE UNIQUE INDEX "UnplannedCard_pickId_playerId_key" ON "UnplannedCard"("pickId", "playerId");

-- AddForeignKey
ALTER TABLE "PlannedCard" ADD CONSTRAINT "PlannedCard_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "Pick"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnplannedCard" ADD CONSTRAINT "UnplannedCard_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "Pick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnplannedCard" ADD CONSTRAINT "UnplannedCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnplannedCard" ADD CONSTRAINT "UnplannedCard_poolCardId_fkey" FOREIGN KEY ("poolCardId") REFERENCES "PoolCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

