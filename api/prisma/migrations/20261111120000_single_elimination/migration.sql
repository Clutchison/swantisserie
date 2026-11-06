-- AlterEnum
ALTER TYPE "TournamentFormat" ADD VALUE 'SingleElimination';

-- AlterEnum
ALTER TYPE "MatchOutcomeKind" ADD VALUE 'GrantedWin';

-- AlterTable
ALTER TABLE "TournamentEntry" ADD COLUMN     "seed" INTEGER;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "grantedTo" "MatchSide",
ADD COLUMN     "bracketPlace" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Match_tournamentId_round_bracketPlace_key" ON "Match"("tournamentId", "round", "bracketPlace");
