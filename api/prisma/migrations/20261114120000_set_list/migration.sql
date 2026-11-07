-- A set list is a third kind of pool source.
ALTER TYPE "PoolSourceKind" ADD VALUE 'SetList';

-- The sets a set list draft's pool is made from, each with the sublists it
-- includes: [{"code": "otj", "sublists": ["big", "otp"]}].
ALTER TABLE "Draft" ADD COLUMN "setList" JSONB;

-- Each kind of pool source has exactly its own columns set, as before, now
-- with the set list among the others' columns. The new kind is compared as
-- text: Postgres refuses an enum value added in the same transaction.
ALTER TABLE "Draft" DROP CONSTRAINT "Draft_pool_query_source";
ALTER TABLE "Draft" DROP CONSTRAINT "Draft_cube_source";
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_pool_query_source"
  CHECK ("poolSourceKind" <> 'PoolQuery'
    OR ("poolQuery" IS NOT NULL AND "cubeId" IS NULL AND "cubeName" IS NULL AND "setList" IS NULL));
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_cube_source"
  CHECK ("poolSourceKind" <> 'Cube'
    OR ("poolQuery" IS NULL AND "cubeId" IS NOT NULL AND "cubeName" IS NOT NULL AND "setList" IS NULL));
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_set_list_source"
  CHECK ("poolSourceKind"::text <> 'SetList'
    OR ("poolQuery" IS NULL AND "cubeId" IS NULL AND "cubeName" IS NULL
      AND "setList" IS NOT NULL AND jsonb_typeof("setList") = 'array' AND jsonb_array_length("setList") > 0));

-- How many cards each Scryfall set adds to a pool on each platform, counted
-- in the background for the set list picker.
CREATE TABLE "SetCardCount" (
    "platform" "Platform" NOT NULL,
    "setCode" TEXT NOT NULL,
    "cards" INTEGER NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetCardCount_pkey" PRIMARY KEY ("platform","setCode")
);
