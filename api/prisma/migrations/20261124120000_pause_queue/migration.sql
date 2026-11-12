-- Pause queue replaces clear queue, as the default and for every player on it.
ALTER TYPE "StealBehavior" RENAME VALUE 'ClearQueue' TO 'PauseQueue';

-- No card lost before this paused its queue or was lost under a steal
-- behavior the notice describes.
ALTER TABLE "UnqueuedCard" ADD COLUMN "pausedQueue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "leftPicking" BOOLEAN NOT NULL DEFAULT false;
