import { databaseBefore } from '../../testing/migrations.js';

const DROP_UNPICKED_CARD_MACHINERY =
  '20261129120000_drop_unpicked_card_machinery';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

describe('the drop unpicked card machinery migration', () => {
  it(
    'takes out of decks the cards left there without their picks, keeping the picks',
    async () => {
      const { db, applyMigration } = await databaseBefore(
        DROP_UNPICKED_CARD_MACHINERY,
      );
      // Only these rows matter, so the rows they refer to needn't exist.
      // Shock was added before Alice picked it, and that pick was undone.
      await db.exec(`
        SET session_replication_role = replica;
        INSERT INTO "PlannedCard" ("id", "playerId", "poolCardId", "pickId", "board", "added")
          VALUES ('p1', 'alice', 'bolt', 'pick', 'Sideboard', false),
                 ('p2', 'alice', 'shock', NULL, 'Mainboard', true);
      `);

      await applyMigration();

      const { rows } = await db.query(
        `SELECT "poolCardId", "pickId", "board" FROM "PlannedCard"`,
      );
      expect(rows).toEqual([
        { poolCardId: 'bolt', pickId: 'pick', board: 'Sideboard' },
      ]);
    },
    SLOW,
  );
});
