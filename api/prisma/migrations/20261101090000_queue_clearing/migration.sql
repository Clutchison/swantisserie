-- CreateTable
CREATE TABLE "UnqueuedCard" (
    "id" TEXT NOT NULL,
    "pickId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "poolCardId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "noticeHidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UnqueuedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnqueuedCard_playerId_idx" ON "UnqueuedCard"("playerId");

-- CreateIndex
CREATE INDEX "UnqueuedCard_poolCardId_idx" ON "UnqueuedCard"("poolCardId");

-- CreateIndex
CREATE UNIQUE INDEX "UnqueuedCard_pickId_playerId_poolCardId_key" ON "UnqueuedCard"("pickId", "playerId", "poolCardId");

-- AddForeignKey
ALTER TABLE "UnqueuedCard" ADD CONSTRAINT "UnqueuedCard_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "Pick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnqueuedCard" ADD CONSTRAINT "UnqueuedCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnqueuedCard" ADD CONSTRAINT "UnqueuedCard_poolCardId_fkey" FOREIGN KEY ("poolCardId") REFERENCES "PoolCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cards already lost keep their place on the notice, against the pick that took them.
INSERT INTO "UnqueuedCard" ("id", "pickId", "playerId", "poolCardId", "position")
SELECT q."id", p."id", q."playerId", q."poolCardId", q."position"
FROM "QueuedCard" q
JOIN "Pick" p ON p."poolCardId" = q."poolCardId"
WHERE q."lostAt" IS NOT NULL;

DELETE FROM "QueuedCard" WHERE "lostAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "QueuedCard" DROP COLUMN "lostAt";
