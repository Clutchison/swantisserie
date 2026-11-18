import type { PGlite } from '@electric-sql/pglite';
import { databaseBefore } from '../../testing/migrations.js';

const DROP_UNPICKED_CARD_MACHINERY =
  '20261129120000_drop_unpicked_card_machinery';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

/**
 * A database just after the migration, whose player Alice had picked
 * Lightning Bolt, on her sideboard, and had added Shock to her deck before
 * picking it, a pick since undone. Foreign keys are checked again once it
 * has run.
 */
async function migrated(): Promise<PGlite> {
  const { db, applyMigration } = await databaseBefore(
    DROP_UNPICKED_CARD_MACHINERY,
  );
  // Only these rows matter, so the rows they refer to needn't exist.
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO "Pick" ("id", "draftId", "number", "playerId", "poolCardId")
      VALUES ('pick', 'd', 1, 'alice', 'bolt');
    INSERT INTO "PlannedCard" ("id", "playerId", "poolCardId", "pickId", "board", "added")
      VALUES ('p1', 'alice', 'bolt', 'pick', 'Sideboard', false),
             ('p2', 'alice', 'shock', NULL, 'Mainboard', true);
  `);
  await applyMigration();
  await db.exec('SET session_replication_role = origin;');
  return db;
}

/** Every deck card left, with its pick and board. */
async function deckCards(db: PGlite) {
  const { rows } = await db.query(
    `SELECT "poolCardId", "pickId", "board" FROM "PlannedCard"`,
  );
  return rows;
}

describe('the drop unpicked card machinery migration', () => {
  it(
    'takes out of decks the cards left there without their picks, keeping the picks',
    async () => {
      const db = await migrated();

      expect(await deckCards(db)).toEqual([
        { poolCardId: 'bolt', pickId: 'pick', board: 'Sideboard' },
      ]);
    },
    SLOW,
  );

  it(
    'makes every deck card a pick, which deleting the pick takes out of the deck',
    async () => {
      const db = await migrated();

      await expect(
        db.exec(
          `INSERT INTO "PlannedCard" ("id", "playerId", "poolCardId", "pickId") VALUES ('p3', 'alice', 'shock', NULL)`,
        ),
      ).rejects.toThrow(/null value/);
      await db.exec(`DELETE FROM "Pick" WHERE "id" = 'pick'`);
      expect(await deckCards(db)).toEqual([]);
    },
    SLOW,
  );
});
