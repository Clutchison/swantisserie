import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdirSync, readFileSync } from 'node:fs';
import { createConnection, createServer, type Server } from 'node:net';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '../../prisma/migrations');

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
  const delay = { ms: 0 };
  const proxy = await delayingProxy(server.getServerConn(), delay);

  return {
    url: `postgresql://postgres@${proxy.address}/postgres`,
    slowDown(ms) {
      delay.ms = ms;
    },
    async reset() {
      delay.ms = 0;
      const { rows } = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      );
      if (rows.length === 0) return;
      await db.exec(
        `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`,
      );
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

/**
 * A TCP proxy to `target` (`host:port`) that holds each reply back for
 * `delay.ms`, keeping the replies in order.
 */
async function delayingProxy(
  target: string,
  delay: { ms: number },
): Promise<{ server: Server; address: string }> {
  const [host, port] = target.split(':');
  const server = createServer((client) => {
    const upstream = createConnection({ host, port: Number(port) });
    client.pipe(upstream);
    // Each reply is sent no sooner than the one before it.
    let sendAt = 0;
    upstream.on('data', (chunk) => {
      if (delay.ms === 0 && sendAt <= Date.now()) {
        client.write(chunk);
        return;
      }
      sendAt = Math.max(Date.now() + delay.ms, sendAt);
      setTimeout(() => client.write(chunk), sendAt - Date.now());
    });
    upstream.on('end', () =>
      setTimeout(() => client.end(), sendAt - Date.now()),
    );
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('The proxy has no address');
  }
  return { server, address: `127.0.0.1:${address.port}` };
}
