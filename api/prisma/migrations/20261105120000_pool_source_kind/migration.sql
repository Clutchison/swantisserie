-- CreateEnum
CREATE TYPE "PoolSourceKind" AS ENUM ('PoolQuery', 'Cube');

-- Every draft records which pool source defines its pool: a cube if it has a
-- cube id, a pool query otherwise.
ALTER TABLE "Draft" ADD COLUMN "poolSourceKind" "PoolSourceKind";
UPDATE "Draft" SET "poolSourceKind" =
  CASE WHEN "cubeId" IS NOT NULL THEN 'Cube' ELSE 'PoolQuery' END::"PoolSourceKind";

-- Rows that would break the constraints below stop the migration, naming
-- them so they can be fixed by hand; nothing here changes them. Postgres runs
-- this file as one transaction, so a failure leaves the schema as it was.
DO $$
DECLARE
  broken_drafts TEXT;
  basic_less_players TEXT;
BEGIN
  SELECT string_agg("id", ', ' ORDER BY "id") INTO broken_drafts
    FROM "Draft"
    WHERE NOT (
      ("poolSourceKind" = 'PoolQuery'
        AND "poolQuery" IS NOT NULL AND "cubeId" IS NULL AND "cubeName" IS NULL)
      OR ("poolSourceKind" = 'Cube'
        AND "poolQuery" IS NULL AND "cubeId" IS NOT NULL AND "cubeName" IS NOT NULL)
    );
  SELECT string_agg(DISTINCT "playerId", ', ' ORDER BY "playerId") INTO basic_less_players
    FROM "PlannedBasic"
    WHERE "count" < 1;
  IF broken_drafts IS NOT NULL OR basic_less_players IS NOT NULL THEN
    RAISE EXCEPTION 'Fix these rows by hand, then deploy again. Pool source neither exactly a pool query nor exactly a named cube: drafts %. Planned basic of fewer than 1 copy: players %.',
      coalesce(broken_drafts, 'none'), coalesce(basic_less_players, 'none');
  END IF;
END $$;

ALTER TABLE "Draft" ALTER COLUMN "poolSourceKind" SET NOT NULL;

-- Each kind of pool source has exactly its own columns set. These replace the
-- cube link migration's rules, which said the same without the kind.
ALTER TABLE "Draft" DROP CONSTRAINT "Draft_one_pool_source";
ALTER TABLE "Draft" DROP CONSTRAINT "Draft_cube_named";
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_pool_query_source"
  CHECK ("poolSourceKind" <> 'PoolQuery'
    OR ("poolQuery" IS NOT NULL AND "cubeId" IS NULL AND "cubeName" IS NULL));
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_cube_source"
  CHECK ("poolSourceKind" <> 'Cube'
    OR ("poolQuery" IS NULL AND "cubeId" IS NOT NULL AND "cubeName" IS NOT NULL));

-- A basic with no copies has no row.
ALTER TABLE "PlannedBasic" ADD CONSTRAINT "PlannedBasic_count_positive"
  CHECK ("count" >= 1);
