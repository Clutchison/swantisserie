import { databaseBefore } from '../testing/migrations.js';

const WASTES_NOT_BASIC = '20261120120000_wastes_not_basic';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

const OGW_183 = '9cc070d3-4b83-4684-9caf-063e5c473a77';
const KHM_395 = '0a9e4a3b-1d47-4c3a-a3a7-6d0d5d3a4c1e';

describe('the migration that makes Wastes no basic land', () => {
  it(
    'deletes every basic land printing, basic land in a plan and preferred printing of Wastes, keeping the five basic lands',
    async () => {
      const { db, applyMigration } = await databaseBefore(WASTES_NOT_BASIC);
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
      for (const [scryfallId, land, set, number] of [
        [OGW_183, 'Wastes', 'ogw', '183a'],
        [KHM_395, 'Island', 'khm', '395'],
      ]) {
        await db.query(
          `INSERT INTO "BasicLandPrinting" ("scryfallId", "land", "setCode", "setName", "setReleasedAt", "collectorNumber", "imageSmall", "imageNormal", "imageLarge")
           VALUES ($1, $2, $3, $3, '2016-01-22', $4, 's', 'n', 'l')`,
          [scryfallId, land, set, number],
        );
        await db.query(
          `INSERT INTO "PreferredPrinting" ("id", "userId", "land", "scryfallId") VALUES (gen_random_uuid(), 'alice', $1, $2)`,
          [land, scryfallId],
        );
        await db.query(
          `INSERT INTO "PlannedBasic" ("id", "playerId", "land", "count") VALUES (gen_random_uuid(), 'player', $1, 2)`,
          [land],
        );
      }

      await applyMigration();

      for (const table of [
        'BasicLandPrinting',
        'PreferredPrinting',
        'PlannedBasic',
      ]) {
        const lands = await db.query(`SELECT "land" FROM "${table}"`);
        expect(lands.rows).toEqual([{ land: 'Island' }]);
      }
      // No row can name Wastes as a basic land again.
      await expect(
        db.query(
          `INSERT INTO "PlannedBasic" ("id", "playerId", "land", "count") VALUES (gen_random_uuid(), 'player', 'Wastes', 1)`,
        ),
      ).rejects.toThrow(/invalid input value for enum/);
      await db.close();
    },
    SLOW,
  );
});
