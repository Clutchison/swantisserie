import { databaseBefore } from '../testing/migrations.js';

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

  // A browser reads these the WHATWG way, so each becomes the path it opened,
  // and none starts with `//` or `/\`, which the api refuses.
  it('turns a URL a browser reads loosely into the path it opens, starting with one /', async () => {
    const { db, applyMigration } = await databaseBefore(PAGE_PATH);
    await db.exec(String.raw`
      SET session_replication_role = replica;
      INSERT INTO "Feedback" ("id", "message", "senderId", "pageUrl")
        VALUES ('a', 'Hi', 'alice', '  https://swantisserie.example/drafts/42'),
               ('b', 'Hi', 'alice', 'https://swantisserie.example\drafts/42'),
               ('c', 'Hi', 'alice', 'https:\\swantisserie.example\x'),
               ('d', 'Hi', 'alice', 'https:evil.example/x'),
               ('e', 'Hi', 'alice', 'https://swantisserie.example//evil.example/x'),
               ('f', 'Hi', 'alice', 'https://swantisserie.example/\evil.example/x'),
               ('g', 'Hi', 'alice', 'https://swantisserie.example/a\b?c\d#e\f');
    `);

    await applyMigration();

    const feedback = await db.query(
      `SELECT "id", "pagePath" FROM "Feedback" ORDER BY "id"`,
    );
    expect(feedback.rows).toEqual([
      { id: 'a', pagePath: '/drafts/42' },
      { id: 'b', pagePath: '/drafts/42' },
      { id: 'c', pagePath: '/x' },
      { id: 'd', pagePath: '/x' },
      { id: 'e', pagePath: '/evil.example/x' },
      { id: 'f', pagePath: '/evil.example/x' },
      { id: 'g', pagePath: String.raw`/a/b?c\d#e\f` },
    ]);
    await db.close();
  }, 30_000);
});
