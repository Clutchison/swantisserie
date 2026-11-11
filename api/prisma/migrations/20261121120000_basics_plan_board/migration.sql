-- Each planned basic sits on a plan board (#642). Every existing row is
-- on the mainboard, the only plan board a basic could sit on before.
ALTER TABLE "PlannedBasic" ADD COLUMN "board" "PlanBoard" NOT NULL DEFAULT 'Mainboard';

-- DropIndex
DROP INDEX "PlannedBasic_playerId_land_key";

-- CreateIndex
CREATE UNIQUE INDEX "PlannedBasic_playerId_land_board_key" ON "PlannedBasic"("playerId", "land", "board");
