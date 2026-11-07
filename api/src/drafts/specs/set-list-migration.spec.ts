import { databaseBefore } from '../../testing/migrations.js';

const SET_LIST = '20261114120000_set_list';

// Starting Postgres and applying every migration can pass 5s on CI.
const SLOW = 30_000;

describe('the set list migration', () => {
  it(
    'refuses a set list draft without its set list, and a pool query or cube draft with one',
    async () => {
      const { db, applyMigration } = await databaseBefore(SET_LIST);
      // Only the draft rows matter, so the rows they refer to needn't exist.
      await db.exec(`SET session_replication_role = replica;`);
      await applyMigration();

      const otj = JSON.stringify([{ code: 'otj', sublists: ['big', 'otp'] }]);
      const draft = (
        kind: string,
        { poolQuery = null, cube = null, setList = null } = {} as {
          poolQuery?: string | null;
          cube?: string | null;
          setList?: string | null;
        },
      ) =>
        db.query(
          `INSERT INTO "Draft" ("id", "name", "poolSourceKind", "poolQuery", "cubeId", "cubeName", "setList", "picksPerPlayer", "organizerId", "updatedAt")
           VALUES (gen_random_uuid(), 'Draft', $1, $2, $3, $3, $4::jsonb, 40, 'organizer', now())`,
          [kind, poolQuery, cube, setList],
        );

      await expect(draft('SetList', { setList: otj })).resolves.toBeTruthy();
      await expect(
        draft('PoolQuery', { poolQuery: 'c:r' }),
      ).resolves.toBeTruthy();
      await expect(draft('Cube', { cube: 'pauper' })).resolves.toBeTruthy();

      const broken = [
        () => draft('SetList'),
        () => draft('SetList', { setList: '[]' }),
        () => draft('SetList', { setList: '{}' }),
        () => draft('SetList', { setList: otj, poolQuery: 'c:r' }),
        () => draft('SetList', { setList: otj, cube: 'pauper' }),
        () => draft('PoolQuery', { poolQuery: 'c:r', setList: otj }),
        () => draft('Cube', { cube: 'pauper', setList: otj }),
      ];
      for (const insert of broken) {
        await expect(insert()).rejects.toThrow(/check constraint/);
      }
      await db.close();
    },
    SLOW,
  );
});
