import { databaseBefore } from '../../testing/migrations.js';

const PAUSE_QUEUE = '20261124120000_pause_queue';

describe('the pause queue migration', () => {
  it('moves every player on clear queue to pause queue, leaves pick next alone, and starts new players on pause queue', async () => {
    const { db, applyMigration } = await databaseBefore(PAUSE_QUEUE);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Player" ("id", "draftId", "userId", "stealBehavior")
        VALUES ('a', 'draft', 'alice', 'ClearQueue'),
               ('b', 'draft', 'bob', 'PickNext');
      INSERT INTO "UnqueuedCard" ("id", "pickId", "playerId", "poolCardId", "position")
        VALUES ('lost', 'pick', 'a', 'bolt', 0);
    `);

    await applyMigration();
    await db.exec(`
      INSERT INTO "Player" ("id", "draftId", "userId") VALUES ('c', 'draft', 'carol');
    `);

    const players = await db.query(
      `SELECT "id", "stealBehavior" FROM "Player" ORDER BY "id"`,
    );
    expect(players.rows).toEqual([
      { id: 'a', stealBehavior: 'PauseQueue' },
      { id: 'b', stealBehavior: 'PickNext' },
      { id: 'c', stealBehavior: 'PauseQueue' },
    ]);
    const takenOut = await db.query(
      `SELECT "pausedQueue", "leftPicking" FROM "UnqueuedCard"`,
    );
    expect(takenOut.rows).toEqual([{ pausedQueue: false, leftPicking: false }]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
