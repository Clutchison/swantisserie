-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "reopenedRound" INTEGER;

-- AlterTable
ALTER TABLE "TournamentEntry" ADD COLUMN     "droppedAfterRound" INTEGER;
