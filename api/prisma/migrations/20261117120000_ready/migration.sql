-- AlterTable: every entry starts not ready.
ALTER TABLE "TournamentEntry" ADD COLUMN "ready" BOOLEAN NOT NULL DEFAULT false;
