-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "publicDecklists" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TournamentEntry" ADD COLUMN     "decklist" JSONB;
