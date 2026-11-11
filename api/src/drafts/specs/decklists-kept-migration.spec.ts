import type { PGlite } from '@electric-sql/pglite';
import { databaseBefore } from '../../testing/migrations.js';

const DECKLISTS_KEPT = '20261119120000_decklists_kept';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

/** A database just before the migration, taking the rows below without the rows they refer to. */
async function databaseWith(rows: string) {
  const database = await databaseBefore(DECKLISTS_KEPT);
  // Only these rows matter, so the rows they refer to needn't exist.
  await database.db.exec(`SET session_replication_role = replica; ${rows}`);
  return database;
}

/** The cards every tournament's decks below are built from. */
const POOL = `
  INSERT INTO "PoolCard" ("id", "draftId", "scryfallId", "oracleId", "name", "set", "collectorNumber", "typeLine", "manaValue", "layout", "rarity", "faces", "images")
    VALUES ('bolt', 'd', 's1', 'o1', 'Lightning Bolt', 'lea', '1', 'Instant', 1, 'normal', 'common', '[]', '[]'),
           ('shock', 'd', 's2', 'o2', 'Shock', 'lea', '2', 'Instant', 1, 'normal', 'common', '[]', '[]'),
           ('spike', 'd', 's3', 'o3', 'Lava Spike', 'lea', '3', 'Sorcery', 1, 'normal', 'common', '[]', '[]'),
           ('shivan', 'd', 's4', 'o4', 'Shivan Dragon', 'lea', '4', 'Creature', 6, 'normal', 'rare', '[]', '[]');
`;

/**
 * The decks of players `<id>-alice` and `<id>-bob`. Alice's: Shock and
 * Lightning Bolt picked, Lava Spike added unpicked to her sideboard, and 2
 * Islands and 17 Mountains. Bob's: Shivan Dragon picked, and no basics.
 */
const decks = (id: string) => `
  INSERT INTO "PlannedCard" ("id", "playerId", "poolCardId", "pickId", "board")
    VALUES ('${id}-p1', '${id}-alice', 'shock', '${id}-shock', 'Mainboard'),
           ('${id}-p2', '${id}-alice', 'bolt', '${id}-bolt', 'Mainboard'),
           ('${id}-p3', '${id}-alice', 'spike', NULL, 'Sideboard'),
           ('${id}-p4', '${id}-bob', 'shivan', '${id}-shivan', 'Mainboard');
  INSERT INTO "PlannedBasic" ("id", "playerId", "land", "count")
    VALUES ('${id}-b1', '${id}-alice', 'Mountain', 17),
           ('${id}-b2', '${id}-alice', 'Island', 2);
`;

const ALICE_DECK = {
  mainboard: [
    { poolCardId: 'bolt', name: 'Lightning Bolt', picked: true },
    { poolCardId: 'shock', name: 'Shock', picked: true },
  ],
  sideboard: [{ poolCardId: 'spike', name: 'Lava Spike', picked: false }],
  basics: [
    { land: 'Island', count: 2 },
    { land: 'Mountain', count: 17 },
  ],
};
const BOB_DECK = {
  mainboard: [{ poolCardId: 'shivan', name: 'Shivan Dragon', picked: true }],
  sideboard: [],
  basics: [],
};

/**
 * A tournament `id` in `state`, its players `<id>-alice` and `<id>-bob`
 * joined with the decks above, Alice's entry `<id>-alice` snapshotted as
 * `aliceDecklist` if given, and Bob's `<id>-bob` not.
 */
function tournament(id: string, state: string, aliceDecklist?: object) {
  const decklist = aliceDecklist
    ? `'${JSON.stringify(aliceDecklist)}'`
    : 'NULL';
  return `
    ${decks(id)}
    INSERT INTO "Tournament" ("id", "draftId", "format", "state")
      VALUES ('${id}', '${id}-draft', 'RoundRobin', '${state}');
    INSERT INTO "TournamentEntry" ("id", "tournamentId", "playerId", "decklist")
      VALUES ('${id}-alice', '${id}', '${id}-alice', ${decklist}),
             ('${id}-bob', '${id}', '${id}-bob', NULL);
  `;
}

/** Each entry's decklist after the migration, by entry id. */
async function decklists(db: PGlite) {
  const { rows } = await db.query<{ id: string; decklist: unknown }>(
    `SELECT "id", "decklist" FROM "TournamentEntry" ORDER BY "id"`,
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.decklist]));
}

describe('the decklists kept migration', () => {
  it(
    'snapshots each entry of a playing tournament without a snapshot as its locked deck',
    async () => {
      const { db, applyMigration } = await databaseWith(
        POOL + tournament('playing', 'Playing'),
      );

      await applyMigration();

      expect(await decklists(db)).toEqual({
        'playing-alice': ALICE_DECK,
        'playing-bob': BOB_DECK,
      });
      await db.close();
    },
    SLOW,
  );

  it(
    'leaves an existing snapshot, and registration and complete tournaments, as they were',
    async () => {
      const kept = { mainboard: [], sideboard: [], basics: [] };
      const { db, applyMigration } = await databaseWith(
        POOL +
          tournament('playing', 'Playing', kept) +
          tournament('registration', 'Registration') +
          tournament('complete', 'Complete'),
      );

      await applyMigration();

      expect(await decklists(db)).toEqual({
        'complete-alice': null,
        'complete-bob': null,
        'playing-alice': kept,
        'playing-bob': BOB_DECK,
        'registration-alice': null,
        'registration-bob': null,
      });
      await db.close();
    },
    SLOW,
  );

  it(
    'adds a completion time, none for any tournament already there',
    async () => {
      const { db, applyMigration } = await databaseWith(
        tournament('complete', 'Complete'),
      );

      await applyMigration();

      const { rows } = await db.query(
        `SELECT "id", "completedAt" FROM "Tournament"`,
      );
      expect(rows).toEqual([{ id: 'complete', completedAt: null }]);
      await db.close();
    },
    SLOW,
  );
});
