import type { PGlite } from '@electric-sql/pglite';
import { databaseBefore } from '../../testing/migrations.js';

const DECK_CARDS_QUEUED = '20261128120000_deck_cards_queued';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

/** A pool card `id` named `name`, of mana value `manaValue`. */
const poolCard = (id: string, name: string, manaValue: number) =>
  `('${id}', 'd', 's-${id}', 'o-${id}', '${name}', 'lea', '1', 'Instant', ${manaValue}, 'normal', 'common', '[]', '[]')`;

/**
 * A draft `draft` in `state`, whose player `<draft>-alice` has queued
 * Opt, then Shock, and holds in her deck Lightning Bolt, picked, and these
 * cards she added without picking them:
 *
 * - Giant Growth on the mainboard and Duress on the sideboard, which left
 *   her queue together most recently, Duress first;
 * - Counterspell on the mainboard, which left her queue before them;
 * - Shivan Dragon, Ancestral Recall and Wrath of God on the mainboard,
 *   and Dark Ritual on the sideboard, none ever queued;
 * - Shock, queued, on the sideboard.
 *
 * Her lost card, Lava Spike, is listed on the Deck notice.
 */
const draft = (id: string, state: string) => `
  INSERT INTO "Draft" ("id", "name", "poolSourceKind", "poolQuery", "picksPerPlayer", "organizerId", "state", "updatedAt")
    VALUES ('${id}', '${id}', 'PoolQuery', 'set:lea', 45, 'alice', '${state}', now());
  INSERT INTO "Player" ("id", "draftId", "userId", "lastQueueDeparture")
    VALUES ('${id}-alice', '${id}', 'alice', 2);
  INSERT INTO "QueuedCard" ("id", "playerId", "poolCardId", "position")
    VALUES ('${id}-q1', '${id}-alice', 'opt', 0),
           ('${id}-q2', '${id}-alice', 'shock', 4);
  INSERT INTO "PlannedCard" ("id", "playerId", "poolCardId", "pickId", "board", "added", "queueDeparture", "queuePosition")
    VALUES ('${id}-p1', '${id}-alice', 'bolt', '${id}-pick', 'Mainboard', false, NULL, NULL),
           ('${id}-p2', '${id}-alice', 'growth', NULL, 'Mainboard', true, 2, 3),
           ('${id}-p3', '${id}-alice', 'duress', NULL, 'Sideboard', true, 2, 1),
           ('${id}-p4', '${id}-alice', 'counterspell', NULL, 'Mainboard', true, 1, 0),
           ('${id}-p5', '${id}-alice', 'shivan', NULL, 'Mainboard', true, NULL, NULL),
           ('${id}-p6', '${id}-alice', 'recall', NULL, 'Mainboard', true, NULL, NULL),
           ('${id}-p7', '${id}-alice', 'wrath', NULL, 'Mainboard', true, NULL, NULL),
           ('${id}-p8', '${id}-alice', 'ritual', NULL, 'Sideboard', true, NULL, NULL),
           ('${id}-p9', '${id}-alice', 'shock', NULL, 'Sideboard', true, NULL, NULL);
  INSERT INTO "UnplannedCard" ("id", "pickId", "playerId", "poolCardId", "board")
    VALUES ('${id}-l1', '${id}-other-pick', '${id}-alice', 'spike', 'Mainboard');
`;

/** Every draft's pool: one card each. */
const POOL = `
  INSERT INTO "PoolCard" ("id", "draftId", "scryfallId", "oracleId", "name", "set", "collectorNumber", "typeLine", "manaValue", "layout", "rarity", "faces", "images")
    VALUES ${[
      poolCard('opt', 'Opt', 1),
      poolCard('shock', 'Shock', 1),
      poolCard('bolt', 'Lightning Bolt', 1),
      poolCard('growth', 'Giant Growth', 1),
      poolCard('duress', 'Duress', 1),
      poolCard('counterspell', 'Counterspell', 2),
      poolCard('shivan', 'Shivan Dragon', 6),
      poolCard('recall', 'Ancestral Recall', 1),
      poolCard('wrath', 'Wrath of God', 4),
      poolCard('ritual', 'Dark Ritual', 1),
      poolCard('spike', 'Lava Spike', 1),
    ].join(', ')};
`;

/** A database just before the migration, holding `drafts`, without the rows they refer to. */
async function databaseWith(drafts: string) {
  const database = await databaseBefore(DECK_CARDS_QUEUED);
  // Only these rows matter, so the rows they refer to needn't exist.
  await database.db.exec(
    `SET session_replication_role = replica; ${POOL} ${drafts}`,
  );
  return database;
}

/** The player's queue, in order, each card with its board. */
async function queue(db: PGlite, playerId: string) {
  const { rows } = await db.query(
    `SELECT "poolCardId", "board" FROM "QueuedCard" WHERE "playerId" = $1 ORDER BY "position"`,
    [playerId],
  );
  return rows;
}

/** The pool cards in the player's deck, picked or not. */
async function deck(db: PGlite, playerId: string) {
  const { rows } = await db.query<{ poolCardId: string }>(
    `SELECT "poolCardId" FROM "PlannedCard" WHERE "playerId" = $1 ORDER BY "poolCardId"`,
    [playerId],
  );
  return rows.map((row) => row.poolCardId);
}

/** The pool cards of the player's lost cards. */
async function lost(db: PGlite, playerId: string) {
  const { rows } = await db.query(
    `SELECT "poolCardId" FROM "UnplannedCard" WHERE "playerId" = $1`,
    [playerId],
  );
  return rows;
}

describe('the deck cards queued migration', () => {
  it(
    'queues the cards a deck holds without their picks, in a draft not yet complete, at the end of the queue, those that left it most recently first, then the mainboard’s and the sideboard’s in the deck’s order, each on its board',
    async () => {
      const { db, applyMigration } = await databaseWith(
        draft('drafting', 'Drafting'),
      );

      await applyMigration();

      expect(await queue(db, 'drafting-alice')).toEqual([
        { poolCardId: 'opt', board: 'Mainboard' },
        // Already queued: it stays where it was, on its own board.
        { poolCardId: 'shock', board: 'Mainboard' },
        { poolCardId: 'duress', board: 'Sideboard' },
        { poolCardId: 'growth', board: 'Mainboard' },
        { poolCardId: 'counterspell', board: 'Mainboard' },
        { poolCardId: 'recall', board: 'Mainboard' },
        { poolCardId: 'wrath', board: 'Mainboard' },
        { poolCardId: 'shivan', board: 'Mainboard' },
        { poolCardId: 'ritual', board: 'Sideboard' },
      ]);
      await db.close();
    },
    SLOW,
  );

  it(
    'leaves only the picks in the deck, and no lost cards',
    async () => {
      const { db, applyMigration } = await databaseWith(
        draft('drafting', 'Drafting'),
      );

      await applyMigration();

      expect(await deck(db, 'drafting-alice')).toEqual(['bolt']);
      expect(await lost(db, 'drafting-alice')).toEqual([]);
      await db.close();
    },
    SLOW,
  );

  it(
    'queues a frozen, a closed and a lobby draft’s too',
    async () => {
      const { db, applyMigration } = await databaseWith(
        draft('frozen', 'Frozen') +
          draft('closed', 'Closed') +
          draft('lobby', 'Lobby'),
      );

      await applyMigration();

      for (const id of ['frozen', 'closed', 'lobby']) {
        expect(await queue(db, `${id}-alice`)).toHaveLength(9);
        expect(await deck(db, `${id}-alice`)).toEqual(['bolt']);
      }
      await db.close();
    },
    SLOW,
  );

  it(
    'leaves a complete draft’s queues and decks as they were',
    async () => {
      const { db, applyMigration } = await databaseWith(
        draft('complete', 'Complete'),
      );

      await applyMigration();

      expect(await queue(db, 'complete-alice')).toEqual([
        { poolCardId: 'opt', board: 'Mainboard' },
        { poolCardId: 'shock', board: 'Mainboard' },
      ]);
      expect(await deck(db, 'complete-alice')).toHaveLength(9);
      expect(await lost(db, 'complete-alice')).toEqual([
        { poolCardId: 'spike' },
      ]);
      await db.close();
    },
    SLOW,
  );
});
