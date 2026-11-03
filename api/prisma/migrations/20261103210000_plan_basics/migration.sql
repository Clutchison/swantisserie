-- CreateEnum
CREATE TYPE "BasicLand" AS ENUM ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes');

-- CreateTable
CREATE TABLE "PlannedBasic" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "land" "BasicLand" NOT NULL,
    "board" "PlanBoard" NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "PlannedBasic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannedBasic_playerId_land_board_key" ON "PlannedBasic"("playerId", "land", "board");

-- AddForeignKey
ALTER TABLE "PlannedBasic" ADD CONSTRAINT "PlannedBasic_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
