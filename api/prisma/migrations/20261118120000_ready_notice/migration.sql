-- AlterTable: no entry has a Ready notice until a deck change clears its ready.
ALTER TABLE "TournamentEntry" ADD COLUMN "readyNotice" BOOLEAN NOT NULL DEFAULT false;
