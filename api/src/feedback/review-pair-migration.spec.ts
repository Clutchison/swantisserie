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

describe('the feedback review pair migration', () => {
  it(
    'keeps every feedback, reviewed or not, as it was',
    async () => {
      const { db, applyMigration } = await databaseWith(`
        INSERT INTO "Feedback" ("id", "message", "senderId", "pagePath", "reviewedById", "reviewedAt")
          VALUES ('a', 'Hi', 'alice', '/', NULL, NULL),
                 ('b', 'Hi', 'alice', '/', 'admin', '2026-11-01 12:00:00');
      `);

      await applyMigration();

      const feedback = await db.query(
        `SELECT "id", "reviewedById", "reviewedAt"::text FROM "Feedback" ORDER BY "id"`,
      );
      expect(feedback.rows).toEqual([
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
      const { db, applyMigration } = await databaseWith(`
        INSERT INTO "Feedback" ("id", "message", "senderId", "pagePath", "reviewedById", "reviewedAt")
          VALUES ('fine', 'Hi', 'alice', '/', NULL, NULL),
                 ('no-time', 'Hi', 'alice', '/', 'admin', NULL),
                 ('no-reviewer', 'Hi', 'alice', '/', NULL, now());
      `);

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

      const feedback = (reviewedById: string | null, reviewedAt: Date | null) =>
        db.query(
          `INSERT INTO "Feedback" ("id", "message", "senderId", "pagePath", "reviewedById", "reviewedAt")
           VALUES (gen_random_uuid(), 'Hi', 'alice', '/', $1, $2)`,
          [reviewedById, reviewedAt],
        );
      await expect(feedback(null, null)).resolves.toBeTruthy();
      await expect(feedback('admin', new Date())).resolves.toBeTruthy();
      await expect(feedback('admin', null)).rejects.toThrow(/check constraint/);
      await expect(feedback(null, new Date())).rejects.toThrow(
        /check constraint/,
      );
      await db.close();
    },
    SLOW,
  );
});
