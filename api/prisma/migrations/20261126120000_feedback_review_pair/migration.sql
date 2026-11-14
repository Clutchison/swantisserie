-- A feedback's reviewer and review time are set and cleared together, as
-- marking it reviewed and unreviewed already does.

-- Rows that would break the constraint below stop the migration, naming them
-- so they can be fixed by hand; nothing here changes them. Postgres runs this
-- file as one transaction, so a failure leaves the schema as it was.
DO $$
DECLARE
  broken_feedback TEXT;
BEGIN
  SELECT string_agg("id", ', ' ORDER BY "id") INTO broken_feedback
    FROM "Feedback"
    WHERE ("reviewedById" IS NULL) <> ("reviewedAt" IS NULL);
  IF broken_feedback IS NOT NULL THEN
    RAISE EXCEPTION 'Fix these rows by hand, then deploy again. A reviewer without a review time, or a review time without a reviewer: feedback %.',
      broken_feedback;
  END IF;
END $$;

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_reviewed_together"
  CHECK (("reviewedById" IS NULL) = ("reviewedAt" IS NULL));
