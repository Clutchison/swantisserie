-- AlterTable: rename, so no feedback is lost
ALTER TABLE "Feedback" RENAME COLUMN "pageUrl" TO "pagePath";

-- Keep only each page's path, query and hash, as a browser reads the URL
-- (WHATWG): it drops leading and trailing spaces and control characters, and
-- reads a backslash before the query or hash as "/".
UPDATE "Feedback"
SET "pagePath" = regexp_replace("pagePath", '^[[:space:][:cntrl:]]+|[[:space:][:cntrl:]]+$', '', 'g');

UPDATE "Feedback"
SET "pagePath" = replace(substring("pagePath" from '^[^?#]*'), '\', '/')
  || coalesce(substring("pagePath" from '[?#].*$'), '');

-- Drop the scheme and host, with or without slashes after the scheme.
UPDATE "Feedback"
SET "pagePath" = regexp_replace("pagePath", '^[A-Za-z][A-Za-z0-9+.-]*:/*[^/?#]*', '');

-- Start with exactly one "/", as the api requires: a browser reads "//" as
-- naming another host, and a URL with no path opens "/".
UPDATE "Feedback"
SET "pagePath" = regexp_replace("pagePath", '^/*', '/');
