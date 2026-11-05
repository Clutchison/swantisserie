-- AlterTable: null for every webhook, as none is known to be gone yet.
ALTER TABLE "Webhook" ADD COLUMN "goneAt" TIMESTAMP(3);
