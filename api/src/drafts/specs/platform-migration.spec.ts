import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '../../../prisma/migrations');
const DRAFT_PLATFORM = '20261102140000_draft_platform';

describe('the draft platform migration', () => {
  it('puts every existing draft on Arena', async () => {
    const db = await PGlite.create();
    const apply = (migration: string) =>
      db.exec(
        readFileSync(join(MIGRATIONS, migration, 'migration.sql'), 'utf8'),
      );
    const earlier = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name < DRAFT_PLATFORM)
      .map((entry) => entry.name)
      .sort();
    for (const migration of earlier) await apply(migration);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Draft" ("id", "name", "poolQuery", "picksPerPlayer", "organizerId", "updatedAt")
        VALUES ('a', 'Cube', 'cube:arena', 40, 'organizer', now()),
               ('b', 'Red', 'c:r', 40, 'organizer', now());
    `);

    await apply(DRAFT_PLATFORM);

    const drafts = await db.query(
      `SELECT "id", "platform" FROM "Draft" ORDER BY "id"`,
    );
    expect(drafts.rows).toEqual([
      { id: 'a', platform: 'Arena' },
      { id: 'b', platform: 'Arena' },
    ]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
