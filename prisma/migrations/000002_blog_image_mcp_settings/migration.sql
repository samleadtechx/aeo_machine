CREATE TYPE "ImageOutputFormat" AS ENUM ('ORIGINAL', 'WEBP', 'JPEG', 'PNG');

ALTER TABLE "Blog"
  ADD COLUMN "imageOptimizationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "imageOutputFormat" "ImageOutputFormat" NOT NULL DEFAULT 'WEBP',
  ADD COLUMN "imageQuality" INTEGER NOT NULL DEFAULT 82,
  ADD COLUMN "imageMaxWidth" INTEGER NOT NULL DEFAULT 1600,
  ADD COLUMN "logoMaxWidth" INTEGER NOT NULL DEFAULT 480;

DROP INDEX "Article_source_sourceExternalId_key";

CREATE UNIQUE INDEX "Article_blogId_source_sourceExternalId_key" ON "Article"("blogId", "source", "sourceExternalId");
