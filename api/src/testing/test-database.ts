import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '../../prisma/migrations');

export interface TestDatabase {
  /** Connection string for PrismaService (set as DATABASE_URL). */
  url: string;
  /** Empties every table, keeping the schema. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * An in-process Postgres (PGlite) with the real migrations applied, served
 * over TCP so the app talks to it through the same Prisma adapter as in
 * production.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const db = await PGlite.create();
  for (const dir of readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
  }

  const server = new PGLiteSocketServer({ db, port: 0, maxConnections: 10 });
  await server.start();

  return {
    url: `postgresql://postgres@${server.getServerConn()}/postgres`,
    async reset() {
      const { rows } = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      );
      if (rows.length === 0) return;
      await db.exec(
        `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`,
      );
    },
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
