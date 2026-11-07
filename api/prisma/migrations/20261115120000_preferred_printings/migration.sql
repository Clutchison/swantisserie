-- CreateTable
CREATE TABLE "PreferredPrinting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "land" "BasicLand" NOT NULL,
    "scryfallId" TEXT NOT NULL,
    "set" TEXT NOT NULL,
    "collectorNumber" TEXT NOT NULL,
    "imageSmall" TEXT NOT NULL,
    "imageNormal" TEXT NOT NULL,
    "imageLarge" TEXT NOT NULL,

    CONSTRAINT "PreferredPrinting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreferredPrinting_userId_land_key" ON "PreferredPrinting"("userId", "land");

-- AddForeignKey
ALTER TABLE "PreferredPrinting" ADD CONSTRAINT "PreferredPrinting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
