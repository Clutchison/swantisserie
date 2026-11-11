import { databaseBefore } from '../../testing/migrations.js';

const BASICS_PLAN_BOARD = '20261121120000_basics_plan_board';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

describe('the migration that puts each basic land in a plan on a plan board', () => {
  it(
    'puts every basic land already in a plan on the mainboard, and lets the sideboard hold the same land',
    async () => {
      const { db, applyMigration } = await databaseBefore(BASICS_PLAN_BOARD);
      await db.query(
        `INSERT INTO "User" ("id", "name", "updatedAt") VALUES ('alice', 'alice', now())`,
      );
      await db.query(
        `INSERT INTO "Draft" ("id", "name", "poolSourceKind", "poolQuery", "picksPerPlayer", "organizerId", "updatedAt")
         VALUES ('draft', 'Draft', 'PoolQuery', 't:land', 2, 'alice', now())`,
      );
      await db.query(
        `INSERT INTO "Player" ("id", "draftId", "userId") VALUES ('player', 'draft', 'alice')`,
      );
      await db.query(
        `INSERT INTO "PlannedBasic" ("id", "playerId", "land", "count")
         VALUES ('island', 'player', 'Island', 3), ('swamp', 'player', 'Swamp', 2)`,
      );

      await applyMigration();

      const basics = await db.query(
        `SELECT "land", "board", "count" FROM "PlannedBasic" ORDER BY "land"`,
      );
      expect(basics.rows).toEqual([
        { land: 'Island', board: 'Mainboard', count: 3 },
        { land: 'Swamp', board: 'Mainboard', count: 2 },
      ]);
      await db.query(
        `INSERT INTO "PlannedBasic" ("id", "playerId", "land", "board", "count")
         VALUES ('sideboard-island', 'player', 'Island', 'Sideboard', 1)`,
      );
      await expect(
        db.query(
          `INSERT INTO "PlannedBasic" ("id", "playerId", "land", "board", "count")
           VALUES ('second-island', 'player', 'Island', 'Sideboard', 1)`,
        ),
      ).rejects.toThrow(/unique constraint/);
    },
    SLOW,
  );
});
