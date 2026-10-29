-- CreateEnum
CREATE TYPE "PoolSnapshotState" AS ENUM ('Running', 'Complete', 'Failed');

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "poolTotal" INTEGER,
ADD COLUMN     "snapshotError" TEXT,
ADD COLUMN     "snapshotState" "PoolSnapshotState" NOT NULL DEFAULT 'Running';

-- CreateTable
CREATE TABLE "PoolCard" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "scryfallId" TEXT NOT NULL,
    "oracleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "set" TEXT NOT NULL,
    "collectorNumber" TEXT NOT NULL,
    "typeLine" TEXT NOT NULL,
    "colors" TEXT[],
    "manaValue" DOUBLE PRECISION NOT NULL,
    "images" JSONB NOT NULL,

    CONSTRAINT "PoolCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoolCard_draftId_oracleId_key" ON "PoolCard"("draftId", "oracleId");

-- AddForeignKey
ALTER TABLE "PoolCard" ADD CONSTRAINT "PoolCard_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
