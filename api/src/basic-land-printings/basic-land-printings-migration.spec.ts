import { databaseBefore } from '../testing/migrations.js';

const BASIC_LAND_PRINTINGS = '20261116120000_basic_land_printings';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

const KHM_395 = '0a9e4a3b-1d47-4c3a-a3a7-6d0d5d3a4c1e';
const ONS_336 = '66666666-7777-4888-8999-aaaaaaaaaaaa';

describe('the basic land printings migration', () => {
  it(
    'keeps every preferred printing, storing its printing with placeholder set data',
    async () => {
      const { db, applyMigration } = await databaseBefore(BASIC_LAND_PRINTINGS);
      for (const user of ['alice', 'bob', 'carol']) {
        await db.query(
          `INSERT INTO "User" ("id", "name", "updatedAt") VALUES ($1, $1, now())`,
          [user],
        );
      }
      const prefer = (
        user: string,
        scryfallId: string,
        set: string,
        number: string,
      ) =>
        db.query(
          `INSERT INTO "PreferredPrinting" ("id", "userId", "land", "scryfallId", "set", "collectorNumber", "imageSmall", "imageNormal", "imageLarge")
           VALUES (gen_random_uuid(), $1, 'Island', $2, $3, $4, $5, $6, $7)`,
          [
            user,
            scryfallId,
            set,
            number,
            `https://cards.scryfall.io/small/${scryfallId}.jpg`,
            `https://cards.scryfall.io/normal/${scryfallId}.jpg`,
            `https://cards.scryfall.io/large/${scryfallId}.jpg`,
          ],
        );
      // Both prefer Kaldheim's: it is stored once.
      await prefer('alice', KHM_395, 'khm', '395');
      await prefer('bob', KHM_395, 'khm', '395');
      await prefer('carol', ONS_336, 'ons', '336');

      await applyMigration();

      const printings = await db.query(
        `SELECT "scryfallId", "land", "setCode", "setName", to_char("setReleasedAt", 'YYYY-MM-DD') AS "setReleasedAt", "collectorNumber", "imageLarge"
         FROM "BasicLandPrinting" ORDER BY "scryfallId"`,
      );
      expect(printings.rows).toEqual([
        {
          scryfallId: KHM_395,
          land: 'Island',
          setCode: 'khm',
          setName: 'KHM',
          setReleasedAt: '1993-08-05',
          collectorNumber: '395',
          imageLarge: `https://cards.scryfall.io/large/${KHM_395}.jpg`,
        },
        {
          scryfallId: ONS_336,
          land: 'Island',
          setCode: 'ons',
          setName: 'ONS',
          setReleasedAt: '1993-08-05',
          collectorNumber: '336',
          imageLarge: `https://cards.scryfall.io/large/${ONS_336}.jpg`,
        },
      ]);
      const preferred = await db.query(
        `SELECT "userId", "scryfallId" FROM "PreferredPrinting" ORDER BY "userId"`,
      );
      expect(preferred.rows).toEqual([
        { userId: 'alice', scryfallId: KHM_395 },
        { userId: 'bob', scryfallId: KHM_395 },
        { userId: 'carol', scryfallId: ONS_336 },
      ]);
      // A preferred printing must refer to a stored printing.
      await expect(
        db.query(`UPDATE "PreferredPrinting" SET "scryfallId" = $1`, [
          '10000000-0000-4000-8000-000000000004',
        ]),
      ).rejects.toThrow(/foreign key/);
      await db.close();
    },
    SLOW,
  );
});
