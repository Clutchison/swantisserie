import { databaseBefore } from '../../testing/migrations.js';

const QUEUE_CLEARING = '20261101090000_queue_clearing';

describe('the queue clearing migration', () => {
  it('moves lost cards against the pick that took them, and leaves queues as they were', async () => {
    const { db, applyMigration } = await databaseBefore(QUEUE_CLEARING);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Pick" ("id", "draftId", "number", "playerId", "poolCardId")
        VALUES ('pick', 'draft', 1, 'picker', 'lost');
      INSERT INTO "QueuedCard" ("id", "playerId", "poolCardId", "position", "lostAt")
        VALUES ('a', 'player', 'lost', 1, now()),
               ('b', 'player', 'first', 0, NULL),
               ('c', 'player', 'last', 2, NULL);
    `);

    await applyMigration();

    const takenOut = await db.query(
      `SELECT "pickId", "playerId", "poolCardId", "position", "noticeHidden" FROM "UnqueuedCard"`,
    );
    expect(takenOut.rows).toEqual([
      {
        pickId: 'pick',
        playerId: 'player',
        poolCardId: 'lost',
        position: 1,
        noticeHidden: false,
      },
    ]);
    const queued = await db.query(
      `SELECT "poolCardId" FROM "QueuedCard" ORDER BY "position"`,
    );
    expect(queued.rows).toEqual([
      { poolCardId: 'first' },
      { poolCardId: 'last' },
    ]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
