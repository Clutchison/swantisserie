-- CreateEnum
CREATE TYPE "StealBehavior" AS ENUM ('ClearQueue', 'PickNext');

-- Every player starts on clear queue, which is how queues behaved before.
ALTER TABLE "Player" ADD COLUMN "stealBehavior" "StealBehavior" NOT NULL DEFAULT 'ClearQueue';

-- Every card lost before this cleared the rest of its queue.
ALTER TABLE "UnqueuedCard" ADD COLUMN "restKept" BOOLEAN NOT NULL DEFAULT false;
