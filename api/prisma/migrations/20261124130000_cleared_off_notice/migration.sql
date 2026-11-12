-- Nothing is cleared any more, so the Queue notice stops listing cards a
-- pick cleared: every taken-out card but the pick's own card. Their rows
-- stay, so that undoing that pick still puts them back.
UPDATE "UnqueuedCard" AS "card"
SET "noticeHidden" = true
FROM "Pick" AS "pick"
WHERE "card"."pickId" = "pick"."id"
  AND "card"."poolCardId" <> "pick"."poolCardId"
  AND "card"."noticeHidden" = false;
