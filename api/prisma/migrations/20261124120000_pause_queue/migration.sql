-- Pause queue replaces clear queue, as the default and for every player on it.
ALTER TYPE "StealBehavior" RENAME VALUE 'ClearQueue' TO 'PauseQueue';

-- CreateEnum
CREATE TYPE "QueueLoss" AS ENUM ('PausedQueue', 'LeftQueuePicking', 'LeftQueuePaused');

-- What a loss did to its queue is unknown for every card lost before this.
ALTER TABLE "UnqueuedCard" ADD COLUMN "queueLoss" "QueueLoss";
