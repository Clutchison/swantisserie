import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startDatabaseProxy } from './database-proxy.js';

/** The real migrations, in the order they apply. */
export function migrations(): string[] {
  const dir = join(import.meta.dirname, '../../prisma/migrations');
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
}

export interface TestDatabase {
  /** Connection string for PrismaService (set as DATABASE_URL). */
  url: string;
  /**
   * Empties every table, keeping the schema, and takes away any slowness
   * `slowDown` added.
   */
  reset(): Promise<void>;
  /** Delays every reply from the database by `ms`, as a busy one would. */
  slowDown(ms: number): void;
  /** See DatabaseProxy's `replyHeld`. */
  replyHeld(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * An in-process Postgres (PGlite) with the real migrations applied, served
 * over TCP so the app talks to it through the same Prisma adapter as in
 * production.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const db = await PGlite.create();
  for (const migration of migrations()) await db.exec(migration);

  const server = new PGLiteSocketServer({ db, port: 0, maxConnections: 10 });
  await server.start();
  const proxy = await startDatabaseProxy(server.getServerConn());

  return {
    url: `postgresql://postgres@${proxy.address}/postgres`,
    slowDown: (ms) => proxy.slowDown(ms),
    replyHeld: () => proxy.replyHeld(),
    async reset() {
      proxy.reset();
      const { rows } = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      );
      if (rows.length === 0) return;
      await db.exec(truncate(rows.map((row) => row.tablename)));
    },
    async stop() {
      // A client's socket closes a moment after the app disconnects, and the
      // server's close handler queries PGlite, so it must outlive them all.
      while (server.getStats().activeConnections > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await new Promise((resolve) => proxy.server.close(resolve));
      await server.stop();
      await db.close();
    },
  };
}

/** SQL emptying every one of `tables`. */
export function truncate(tables: string[]): string {
  return `TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')} CASCADE`;
}
