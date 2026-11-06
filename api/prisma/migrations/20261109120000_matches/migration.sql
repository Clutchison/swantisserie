-- CreateEnum
CREATE TYPE "MatchOutcomeKind" AS ENUM ('Unreported', 'GameScore', 'GrantedDraw', 'Forfeit');

-- CreateEnum
CREATE TYPE "MatchSide" AS ENUM ('First', 'Second');

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "firstEntryId" TEXT NOT NULL,
    "secondEntryId" TEXT,
    "outcome" "MatchOutcomeKind" NOT NULL DEFAULT 'Unreported',
    "firstGames" INTEGER NOT NULL DEFAULT 0,
    "secondGames" INTEGER NOT NULL DEFAULT 0,
    "drawnGames" INTEGER NOT NULL DEFAULT 0,
    "forfeitedBy" "MatchSide",
    "reportedById" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id"),
    -- Games are never negative, and only a game score has any.
    CONSTRAINT "Match_games_check" CHECK (
        "firstGames" >= 0 AND "secondGames" >= 0 AND "drawnGames" >= 0
        AND ("outcome" = 'GameScore' OR ("firstGames" = 0 AND "secondGames" = 0 AND "drawnGames" = 0))
    ),
    -- A forfeit, and only a forfeit, names the side that forfeited.
    CONSTRAINT "Match_forfeit_check" CHECK (("outcome" = 'Forfeit') = ("forfeitedBy" IS NOT NULL)),
    -- A bye has no second entry and is never decided.
    CONSTRAINT "Match_bye_check" CHECK ("secondEntryId" IS NOT NULL OR "outcome" = 'Unreported')
);

-- CreateIndex
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");

-- CreateIndex
CREATE INDEX "Match_firstEntryId_idx" ON "Match"("firstEntryId");

-- CreateIndex
CREATE INDEX "Match_secondEntryId_idx" ON "Match"("secondEntryId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_firstEntryId_fkey" FOREIGN KEY ("firstEntryId") REFERENCES "TournamentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_secondEntryId_fkey" FOREIGN KEY ("secondEntryId") REFERENCES "TournamentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
