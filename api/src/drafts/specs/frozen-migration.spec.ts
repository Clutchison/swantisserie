import { databaseBefore } from '../../testing/migrations.js';

const FROZEN = '20261122120000_frozen';

describe('the frozen migration', () => {
  it('makes every paused draft frozen, and leaves the others as they were', async () => {
    const { db, applyMigration } = await databaseBefore(FROZEN);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Draft" ("id", "name", "poolSourceKind", "poolQuery", "picksPerPlayer", "organizerId", "state", "updatedAt")
        VALUES ('a', 'A', 'PoolQuery', 'set:lea', 45, 'alice', 'Paused', now()),
               ('b', 'B', 'PoolQuery', 'set:lea', 45, 'alice', 'Drafting', now());
    `);

    await applyMigration();

    const drafts = await db.query(
      `SELECT "id", "state" FROM "Draft" ORDER BY "id"`,
    );
    expect(drafts.rows).toEqual([
      { id: 'a', state: 'Frozen' },
      { id: 'b', state: 'Drafting' },
    ]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
