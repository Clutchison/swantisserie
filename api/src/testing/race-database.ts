import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { startDatabaseProxy } from './database-proxy.js';
import { migrations, type TestDatabase } from './test-database.js';

/**
 * The env var naming the Postgres server the race specs run on. It is never
 * `DATABASE_URL` or `DIRECT_URL`: the suite empties tables, so it must not
 * find a real database by accident.
 */
export const RACE_DATABASE_URL = 'RACE_DATABASE_URL';

/** The hosts a race database may be made on: a server on this machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** A test database on a real Postgres server, where transactions can race. */
export interface RaceDatabase extends TestDatabase {
  /** The database's name: `race_` and random hex. */
  name: string;
  /** See DatabaseProxy's `holdCommits`. */
  holdCommits(count: number, timeoutMs: number): void;
}

/**
 * The URL of the server `RACE_DATABASE_URL` names in `env`, or undefined
 * when it isn't set. Throws, before anything connects to it, if it is not on
 * this machine, is a Neon host, or names the same database as `DATABASE_URL`
 * or `DIRECT_URL`.
 */
export function raceServer(env: NodeJS.ProcessEnv): URL | undefined {
  const value = env[RACE_DATABASE_URL];
  if (!value) return undefined;
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (host === 'neon.tech' || host.endsWith('.neon.tech')) {
    throw new Error(`${RACE_DATABASE_URL} must not be a Neon host: ${host}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${RACE_DATABASE_URL} must be localhost or 127.0.0.1, not ${host}`,
    );
  }
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const other = env[name];
    if (other && sameDatabase(url, other)) {
      throw new Error(`${RACE_DATABASE_URL} must not name ${name}'s database`);
    }
  }
  return url;
}

/** Whether `other` names the same database on the same server as `url`. */
function sameDatabase(url: URL, other: string): boolean {
  if (other === url.href) return true;
  let parsed: URL;
  try {
    parsed = new URL(other);
  } catch {
    return false;
  }
  const where = (u: URL) =>
    [u.hostname.toLowerCase(), u.port || '5432', u.pathname].join('|');
  return where(parsed) === where(url);
}

/**
 * Creates a database of its own, named `race_` and random hex, on the
 * server `RACE_DATABASE_URL` names, and applies the real migrations there.
 * Only ever writes to that database: `reset` empties it, and `stop` drops
 * it. Throws, before connecting, if `raceServer` refuses the server or it
 * isn't set.
 */
export async function startRaceDatabase(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RaceDatabase> {
  const server = raceServer(env);
  if (!server) throw new Error(`${RACE_DATABASE_URL} is not set`);
  const name = `race_${randomBytes(8).toString('hex')}`;

  // Connected to the server's own database only to create and drop ours.
  const admin = new pg.Client({ connectionString: server.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const drop = async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  };

  const own = new URL(server);
  own.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: own.href });
  let proxy: Awaited<ReturnType<typeof startDatabaseProxy>>;
  try {
    await db.connect();
    for (const migration of migrations()) await db.query(migration);
    proxy = await startDatabaseProxy(
      `${server.hostname}:${server.port || 5432}`,
    );
  } catch (err) {
    await db.end().catch(() => {});
    await drop();
    throw err;
  }

  const url = new URL(own);
  url.host = proxy.address;
  return {
    name,
    url: url.href,
    slowDown: (ms) => proxy.slowDown(ms),
    holdCommits: (count, timeoutMs) => proxy.holdCommits(count, timeoutMs),
    async reset() {
      proxy.reset();
      const { rows } = await db.query<{ db: string; tablename: string }>(
        `SELECT current_database() AS db, tablename
         FROM pg_tables WHERE schemaname = 'public'`,
      );
      if (rows.length === 0) return;
      if (rows.some((row) => row.db !== name)) {
        throw new Error(`Refusing to empty a database that isn't ${name}`);
      }
      await db.query(
        `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`,
      );
    },
    async stop() {
      proxy.reset();
      await db.end();
      // Ends any connection to it still open, through the proxy or not.
      await drop();
      await new Promise((resolve) => proxy.server.close(resolve));
    },
  };
}
