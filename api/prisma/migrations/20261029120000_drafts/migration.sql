-- CreateEnum
CREATE TYPE "DraftState" AS ENUM ('Lobby', 'Drafting', 'Paused', 'Complete');

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "poolQuery" TEXT NOT NULL,
    "picksPerPlayer" INTEGER NOT NULL,
    "state" "DraftState" NOT NULL DEFAULT 'Lobby',
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Draft_organizerId_idx" ON "Draft"("organizerId");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

