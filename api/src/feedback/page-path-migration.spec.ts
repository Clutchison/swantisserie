import { databaseBefore } from '../drafts/specs/migrations.js';

const PAGE_PATH = '20261104120000_feedback_page_path';

describe('the feedback page path migration', () => {
  it('keeps every feedback, turning the full URL of its page into a path', async () => {
    const { db, applyMigration } = await databaseBefore(PAGE_PATH);
    // Only these rows matter, so the senders they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Feedback" ("id", "message", "senderId", "pageUrl")
        VALUES ('a', 'Hi', 'alice', 'https://swantisserie.example/drafts/42?a=1#b'),
               ('b', 'Hi', 'alice', 'http://localhost:4200/'),
               ('c', 'Hi', 'alice', 'https://swantisserie.example'),
               ('d', 'Hi', 'alice', 'https://swantisserie.example?tab=pool');
    `);

    await applyMigration();

    const feedback = await db.query(
      `SELECT "id", "pagePath" FROM "Feedback" ORDER BY "id"`,
    );
    expect(feedback.rows).toEqual([
      { id: 'a', pagePath: '/drafts/42?a=1#b' },
      { id: 'b', pagePath: '/' },
      { id: 'c', pagePath: '/' },
      { id: 'd', pagePath: '/?tab=pool' },
    ]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
