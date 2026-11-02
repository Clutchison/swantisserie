-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('Arena', 'MTGO');

-- Every draft made before platforms existed was played on Arena.
ALTER TABLE "Draft" ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'Arena';
