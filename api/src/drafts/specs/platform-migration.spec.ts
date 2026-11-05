import { databaseBefore } from '../../testing/migrations.js';

const DRAFT_PLATFORM = '20261102140000_draft_platform';

describe('the draft platform migration', () => {
  it('puts every existing draft on Arena', async () => {
    const { db, applyMigration } = await databaseBefore(DRAFT_PLATFORM);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Draft" ("id", "name", "poolQuery", "picksPerPlayer", "organizerId", "updatedAt")
        VALUES ('a', 'Cube', 'cube:arena', 40, 'organizer', now()),
               ('b', 'Red', 'c:r', 40, 'organizer', now());
    `);

    await applyMigration();

    const drafts = await db.query(
      `SELECT "id", "platform" FROM "Draft" ORDER BY "id"`,
    );
    expect(drafts.rows).toEqual([
      { id: 'a', platform: 'Arena' },
      { id: 'b', platform: 'Arena' },
    ]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
