-- Every queue starts picking, existing ones included.
ALTER TABLE "Player" ADD COLUMN "queuePaused" BOOLEAN NOT NULL DEFAULT false;
