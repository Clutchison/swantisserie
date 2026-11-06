-- AlterEnum
ALTER TYPE "TournamentFormat" ADD VALUE 'Swiss';

-- CreateEnum
CREATE TYPE "SwissRoundOption" AS ENUM ('UntilWinner', 'CappedAt3');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "lastCompletedRound" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "swissRoundOption" "SwissRoundOption";
