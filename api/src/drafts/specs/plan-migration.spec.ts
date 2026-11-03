import { databaseBefore } from './migrations.js';

const PLANS = '20261103150000_plans';

describe('the plans migration', () => {
  it('puts every pick already made on its player’s mainboard', async () => {
    const { db, applyMigration } = await databaseBefore(PLANS);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Pick" ("id", "draftId", "number", "playerId", "poolCardId")
        VALUES ('pick-1', 'draft', 1, 'a', 'shock'), ('pick-2', 'draft', 2, 'b', 'bolt');
    `);

    await applyMigration();

    const planned = await db.query(
      `SELECT "playerId", "poolCardId", "pickId", "board" FROM "PlannedCard"
       ORDER BY "pickId"`,
    );
    expect(planned.rows).toEqual([
      {
        playerId: 'a',
        poolCardId: 'shock',
        pickId: 'pick-1',
        board: 'Mainboard',
      },
      {
        playerId: 'b',
        poolCardId: 'bolt',
        pickId: 'pick-2',
        board: 'Mainboard',
      },
    ]);
    const ids = await db.query<{ id: string }>(
      `SELECT "id" FROM "PlannedCard"`,
    );
    expect(new Set(ids.rows.map((row) => row.id)).size).toBe(2);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
