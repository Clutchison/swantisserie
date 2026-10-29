-- CreateTable
CREATE TABLE "QueuedCard" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "poolCardId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "lostAt" TIMESTAMP(3),

    CONSTRAINT "QueuedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueuedCard_poolCardId_idx" ON "QueuedCard"("poolCardId");

-- CreateIndex
CREATE UNIQUE INDEX "QueuedCard_playerId_poolCardId_key" ON "QueuedCard"("playerId", "poolCardId");

-- AddForeignKey
ALTER TABLE "QueuedCard" ADD CONSTRAINT "QueuedCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueuedCard" ADD CONSTRAINT "QueuedCard_poolCardId_fkey" FOREIGN KEY ("poolCardId") REFERENCES "PoolCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
