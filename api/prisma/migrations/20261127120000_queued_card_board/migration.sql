-- Each queued copy sits on a deck board, which its pick lands on, and a
-- taken-out queued card keeps the board it sat on for an undo. Existing rows
-- start on the mainboard, where every queued card has sat until now.
ALTER TABLE "QueuedCard" ADD COLUMN "board" "PlanBoard" NOT NULL DEFAULT 'Mainboard';
ALTER TABLE "UnqueuedCard" ADD COLUMN "board" "PlanBoard" NOT NULL DEFAULT 'Mainboard';
