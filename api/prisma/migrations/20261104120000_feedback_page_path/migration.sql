-- AlterTable: rename, so no feedback is lost
ALTER TABLE "Feedback" RENAME COLUMN "pageUrl" TO "pagePath";

-- Keep only each page's path, query and hash: drop the scheme and host, and
-- start with "/" when the URL had no path.
UPDATE "Feedback"
SET "pagePath" = regexp_replace("pagePath", '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*', '');

UPDATE "Feedback"
SET "pagePath" = '/' || "pagePath"
WHERE "pagePath" NOT LIKE '/%';
