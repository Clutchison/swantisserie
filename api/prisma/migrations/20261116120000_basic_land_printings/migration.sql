-- CreateTable
CREATE TABLE "BasicLandPrinting" (
    "scryfallId" TEXT NOT NULL,
    "land" "BasicLand" NOT NULL,
    "setCode" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "setReleasedAt" DATE NOT NULL,
    "collectorNumber" TEXT NOT NULL,
    "imageSmall" TEXT NOT NULL,
    "imageNormal" TEXT NOT NULL,
    "imageLarge" TEXT NOT NULL,

    CONSTRAINT "BasicLandPrinting_pkey" PRIMARY KEY ("scryfallId")
);

-- CreateTable
CREATE TABLE "BasicLandPrintingRefresh" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasicLandPrintingRefresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BasicLandPrinting_land_idx" ON "BasicLandPrinting"("land");

-- Keep every preferred printing: store its printing from what it copied.
-- It copied no set name or release date, so these are placeholders, which
-- the first refresh overwrites: no refresh has finished yet, so the first
-- request for printings starts one.
INSERT INTO "BasicLandPrinting" ("scryfallId", "land", "setCode", "setName", "setReleasedAt", "collectorNumber", "imageSmall", "imageNormal", "imageLarge")
SELECT DISTINCT ON ("scryfallId") "scryfallId", "land", "set", UPPER("set"), DATE '1993-08-05', "collectorNumber", "imageSmall", "imageNormal", "imageLarge"
FROM "PreferredPrinting"
ORDER BY "scryfallId";

-- AlterTable
ALTER TABLE "PreferredPrinting" DROP COLUMN "collectorNumber",
DROP COLUMN "imageLarge",
DROP COLUMN "imageNormal",
DROP COLUMN "imageSmall",
DROP COLUMN "set";

-- AddForeignKey
ALTER TABLE "PreferredPrinting" ADD CONSTRAINT "PreferredPrinting_scryfallId_fkey" FOREIGN KEY ("scryfallId") REFERENCES "BasicLandPrinting"("scryfallId") ON DELETE RESTRICT ON UPDATE CASCADE;
