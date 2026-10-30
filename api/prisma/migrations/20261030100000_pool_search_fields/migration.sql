-- AlterTable
ALTER TABLE "PoolCard" ADD COLUMN     "colorIdentity" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defense" TEXT,
ADD COLUMN     "faces" JSONB,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "layout" TEXT,
ADD COLUMN     "loyalty" TEXT,
ADD COLUMN     "manaCost" TEXT,
ADD COLUMN     "oracleText" TEXT,
ADD COLUMN     "power" TEXT,
ADD COLUMN     "rarity" TEXT,
ADD COLUMN     "toughness" TEXT;
