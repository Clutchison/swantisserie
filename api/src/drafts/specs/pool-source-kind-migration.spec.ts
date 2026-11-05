import { databaseBefore } from '../../testing/migrations.js';

const POOL_SOURCE_KIND = '20261105120000_pool_source_kind';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

/** A database just before the migration, taking the rows below without the rows they refer to. */
async function databaseWith(rows: string) {
  const database = await databaseBefore(POOL_SOURCE_KIND);
  // Only these rows matter, so the rows they refer to needn't exist.
  await database.db.exec(`SET session_replication_role = replica; ${rows}`);
  return database;
}

const POOL_QUERY_DRAFT = `INSERT INTO "Draft" ("id", "name", "poolQuery", "picksPerPlayer", "organizerId", "updatedAt")
  VALUES ('red', 'Red', 'c:r', 40, 'organizer', now());`;
const CUBE_DRAFT = `INSERT INTO "Draft" ("id", "name", "cubeId", "cubeName", "picksPerPlayer", "organizerId", "updatedAt")
  VALUES ('pauper', 'Pauper', 'thepaupercube', 'The Pauper Cube', 45, 'organizer', now());`;

describe('the pool source kind migration', () => {
  it(
    'records each existing draft’s pool source kind, and leaves its pool source as it was',
    async () => {
      const { db, applyMigration } = await databaseWith(
        POOL_QUERY_DRAFT + CUBE_DRAFT,
      );

      await applyMigration();

      const drafts = await db.query(
        `SELECT "id", "poolSourceKind", "poolQuery", "cubeId", "cubeName" FROM "Draft" ORDER BY "id"`,
      );
      expect(drafts.rows).toEqual([
        {
          id: 'pauper',
          poolSourceKind: 'Cube',
          poolQuery: null,
          cubeId: 'thepaupercube',
          cubeName: 'The Pauper Cube',
        },
        {
          id: 'red',
          poolSourceKind: 'PoolQuery',
          poolQuery: 'c:r',
          cubeId: null,
          cubeName: null,
        },
      ]);
      await db.close();
    },
    SLOW,
  );

  it(
    'fails, naming each draft whose pool source breaks the rules',
    async () => {
      // The cube link migration's constraints already refuse these rows, so
      // they're dropped here to stand for a row that somehow got past them.
      const { db, applyMigration } = await databaseWith(`
      ALTER TABLE "Draft" DROP CONSTRAINT "Draft_one_pool_source";
      ALTER TABLE "Draft" DROP CONSTRAINT "Draft_cube_named";
      ${POOL_QUERY_DRAFT}
      INSERT INTO "Draft" ("id", "name", "poolQuery", "cubeId", "cubeName", "picksPerPlayer", "organizerId", "updatedAt")
        VALUES ('both', 'Both', 'c:r', 'thepaupercube', 'The Pauper Cube', 40, 'organizer', now()),
               ('neither', 'Neither', NULL, NULL, NULL, 40, 'organizer', now()),
               ('unnamed', 'Unnamed', NULL, 'thepaupercube', NULL, 40, 'organizer', now());
    `);

      await expect(applyMigration()).rejects.toThrow(
        /drafts both, neither, unnamed\b/,
      );
      await db.close();
    },
    SLOW,
  );

  it(
    'fails, naming each player with a planned basic of no copies',
    async () => {
      const { db, applyMigration } = await databaseWith(`
      INSERT INTO "PlannedBasic" ("id", "playerId", "land", "count")
        VALUES ('a', 'alice', 'Island', 3), ('b', 'bob', 'Forest', 0);
    `);

      await expect(applyMigration()).rejects.toThrow(/players bob\b/);
      await db.close();
    },
    SLOW,
  );

  it(
    'then refuses a draft whose pool source doesn’t match its kind, and a planned basic of no copies',
    async () => {
      const { db, applyMigration } = await databaseWith('');
      await applyMigration();

      const draft = (
        kind: string,
        poolQuery: string | null,
        cubeId: string | null,
        cubeName: string | null,
      ) =>
        db.query(
          `INSERT INTO "Draft" ("id", "name", "poolSourceKind", "poolQuery", "cubeId", "cubeName", "picksPerPlayer", "organizerId", "updatedAt")
           VALUES (gen_random_uuid(), 'Draft', $1, $2, $3, $4, 40, 'organizer', now())`,
          [kind, poolQuery, cubeId, cubeName],
        );
      await expect(draft('PoolQuery', 'c:r', null, null)).resolves.toBeTruthy();
      await expect(
        draft('Cube', null, 'thepaupercube', 'The Pauper Cube'),
      ).resolves.toBeTruthy();
      const brokenDrafts: [
        string,
        string | null,
        string | null,
        string | null,
      ][] = [
        ['PoolQuery', null, null, null],
        ['PoolQuery', 'c:r', 'thepaupercube', 'The Pauper Cube'],
        ['Cube', null, null, null],
        ['Cube', 'c:r', 'thepaupercube', 'The Pauper Cube'],
        ['Cube', null, 'thepaupercube', null],
        ['Cube', null, null, 'The Pauper Cube'],
      ];
      for (const broken of brokenDrafts) {
        await expect(draft(...broken)).rejects.toThrow(/check constraint/);
      }
      await expect(
        db.query(
          `INSERT INTO "PlannedBasic" ("id", "playerId", "land", "count")
           VALUES ('none', 'alice', 'Island', 0)`,
        ),
      ).rejects.toThrow(/check constraint/);
      await db.close();
    },
    SLOW,
  );
});
