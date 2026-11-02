-- A draft's pool comes from either a pool query or a CubeCobra cube.
ALTER TABLE "Draft" ALTER COLUMN "poolQuery" DROP NOT NULL;
ALTER TABLE "Draft" ADD COLUMN "cubeId" TEXT;
ALTER TABLE "Draft" ADD COLUMN "cubeName" TEXT;

-- Exactly one pool source, and a cube's name with its id.
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_one_pool_source"
  CHECK (("poolQuery" IS NULL) <> ("cubeId" IS NULL));
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_cube_named"
  CHECK (("cubeId" IS NULL) = ("cubeName" IS NULL));
