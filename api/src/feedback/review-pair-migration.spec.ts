import { databaseBefore } from '../testing/migrations.js';

const REVIEW_PAIR = '20261126120000_feedback_review_pair';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

/** A database just before the migration, taking the rows below without the rows they refer to. */
async function databaseWith(rows: string) {
  const database = await databaseBefore(REVIEW_PAIR);
  // Only these rows matter, so the senders and reviewers needn't exist.
  await database.db.exec(`SET session_replication_role = replica; ${rows}`);
  return database;
}

/** The SQL that inserts feedback from alice, each row its id, reviewer and review time as SQL. */
const feedbackInsert = (
  ...rows: [id: string, reviewedById: string, reviewedAt: string][]
) =>
  `INSERT INTO "Feedback" ("id", "message", "senderId", "pagePath", "reviewedById", "reviewedAt")
     VALUES ${rows.map((row) => `(${row[0]}, 'Hi', 'alice', '/', ${row[1]}, ${row[2]})`).join(', ')};`;

describe('the feedback review pair migration', () => {
  it(
    'keeps every feedback, reviewed or not, as it was',
    async () => {
      const { db, applyMigration } = await databaseWith(
        feedbackInsert(
          ["'a'", 'NULL', 'NULL'],
          ["'b'", "'admin'", "'2026-11-01 12:00:00'"],
        ),
      );

      await applyMigration();

      const kept = await db.query(
        `SELECT "id", "reviewedById", "reviewedAt"::text FROM "Feedback" ORDER BY "id"`,
      );
      expect(kept.rows).toEqual([
        { id: 'a', reviewedById: null, reviewedAt: null },
        { id: 'b', reviewedById: 'admin', reviewedAt: '2026-11-01 12:00:00' },
      ]);
      await db.close();
    },
    SLOW,
  );

  it(
    'fails, naming each feedback with a reviewer and no review time, or the reverse',
    async () => {
      const { db, applyMigration } = await databaseWith(
        feedbackInsert(
          ["'fine'", 'NULL', 'NULL'],
          ["'no-time'", "'admin'", 'NULL'],
          ["'no-reviewer'", 'NULL', 'now()'],
        ),
      );

      await expect(applyMigration()).rejects.toThrow(
        /feedback no-reviewer, no-time\b/,
      );
      await db.close();
    },
    SLOW,
  );

  it(
    'then refuses a feedback with a reviewer and no review time, or a review time and no reviewer',
    async () => {
      const { db, applyMigration } = await databaseWith('');
      await applyMigration();

      const insertFeedback = (
        reviewedById: string | null,
        reviewedAt: Date | null,
      ) =>
        db.query(feedbackInsert(['gen_random_uuid()', '$1', '$2']), [
          reviewedById,
          reviewedAt,
        ]);
      await expect(insertFeedback(null, null)).resolves.toBeTruthy();
      await expect(insertFeedback('admin', new Date())).resolves.toBeTruthy();
      await expect(insertFeedback('admin', null)).rejects.toThrow(
        /check constraint/,
      );
      await expect(insertFeedback(null, new Date())).rejects.toThrow(
        /check constraint/,
      );
      await db.close();
    },
    SLOW,
  );
});
