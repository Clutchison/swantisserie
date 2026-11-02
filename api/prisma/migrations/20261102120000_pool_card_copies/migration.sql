-- A pool can hold several copies of the same card.
DROP INDEX "PoolCard_draftId_oracleId_key";

-- CreateIndex
CREATE INDEX "PoolCard_draftId_idx" ON "PoolCard"("draftId");
