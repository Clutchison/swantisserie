-- The organizer's stop is Frozen, so "paused" can mean only a queue's state.
ALTER TYPE "DraftState" RENAME VALUE 'Paused' TO 'Frozen';
