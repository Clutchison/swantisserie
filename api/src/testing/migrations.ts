import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '../../../prisma/migrations');

/**
 * A fresh database with every migration before `migration` applied, and a
 * way to apply that one, so a spec can put rows in its way first.
 */
export async function databaseBefore(migration: string) {
  const db = await PGlite.create();
  const apply = (name: string) =>
    db.exec(readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'));
  const earlier = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name < migration)
    .map((entry) => entry.name)
    .sort();
  for (const name of earlier) await apply(name);
  return { db, applyMigration: () => apply(migration) };
}
