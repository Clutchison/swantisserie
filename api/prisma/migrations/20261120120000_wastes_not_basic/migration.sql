-- Wastes is no longer a basic land (#637): delete every row that names
-- it, then drop it from the enum. Preferred printings go first, as each
-- refers to its stored printing.
DELETE FROM "PreferredPrinting" WHERE "land" = 'Wastes';
DELETE FROM "PlannedBasic" WHERE "land" = 'Wastes';
DELETE FROM "BasicLandPrinting" WHERE "land" = 'Wastes';

-- AlterEnum
CREATE TYPE "BasicLand_new" AS ENUM ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest');
ALTER TABLE "PlannedBasic" ALTER COLUMN "land" TYPE "BasicLand_new" USING ("land"::text::"BasicLand_new");
ALTER TABLE "PreferredPrinting" ALTER COLUMN "land" TYPE "BasicLand_new" USING ("land"::text::"BasicLand_new");
ALTER TABLE "BasicLandPrinting" ALTER COLUMN "land" TYPE "BasicLand_new" USING ("land"::text::"BasicLand_new");
ALTER TYPE "BasicLand" RENAME TO "BasicLand_old";
ALTER TYPE "BasicLand_new" RENAME TO "BasicLand";
DROP TYPE "BasicLand_old";
