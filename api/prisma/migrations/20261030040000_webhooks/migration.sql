-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "webhookId" TEXT;

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_name_key" ON "Webhook"("name");

-- CreateIndex
CREATE INDEX "Draft_webhookId_idx" ON "Draft"("webhookId");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
