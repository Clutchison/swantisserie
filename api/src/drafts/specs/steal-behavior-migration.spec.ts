import { databaseBefore } from './migrations.js';

const STEAL_BEHAVIOR = '20261103090000_steal_behavior';

describe('the steal behavior migration', () => {
  it('puts every existing player on clear queue, and marks every lost card as having cleared its queue', async () => {
    const { db, applyMigration } = await databaseBefore(STEAL_BEHAVIOR);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Player" ("id", "draftId", "userId")
        VALUES ('a', 'draft', 'alice'), ('b', 'draft', 'bob');
      INSERT INTO "UnqueuedCard" ("id", "pickId", "playerId", "poolCardId", "position")
        VALUES ('lost', 'pick', 'b', 'bolt', 0);
    `);

    await applyMigration();

    const players = await db.query(
      `SELECT "id", "stealBehavior" FROM "Player" ORDER BY "id"`,
    );
    expect(players.rows).toEqual([
      { id: 'a', stealBehavior: 'ClearQueue' },
      { id: 'b', stealBehavior: 'ClearQueue' },
    ]);
    const takenOut = await db.query(`SELECT "restKept" FROM "UnqueuedCard"`);
    expect(takenOut.rows).toEqual([{ restKept: false }]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
