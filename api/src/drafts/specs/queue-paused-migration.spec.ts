import { databaseBefore } from '../../testing/migrations.js';

const QUEUE_PAUSED = '20261123120000_queue_paused';

describe('the queue paused migration', () => {
  it('sets every existing player’s queue picking', async () => {
    const { db, applyMigration } = await databaseBefore(QUEUE_PAUSED);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Player" ("id", "draftId", "userId")
        VALUES ('a', 'draft', 'alice'), ('b', 'draft', 'bob');
    `);

    await applyMigration();

    const players = await db.query(
      `SELECT "id", "queuePaused" FROM "Player" ORDER BY "id"`,
    );
    expect(players.rows).toEqual([
      { id: 'a', queuePaused: false },
      { id: 'b', queuePaused: false },
    ]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
