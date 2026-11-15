import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * How long a query waits to open a connection to the database, or to get
 * one from a pool whose connections are all busy, before it fails as any
 * database error does: well under Heroku's 30 s router limit, so a database
 * that can't be reached fails a request within seconds rather than leaving
 * the router to answer 503. pg waits forever by default, and ignores a
 * `connect_timeout` in `DATABASE_URL`.
 */
export const DATABASE_CONNECTION_DEADLINE_MS = 5_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationShutdown
{
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        // Unset in production, for pg's default.
        max: Number(process.env.DATABASE_POOL_SIZE) || undefined,
        connectionTimeoutMillis: DATABASE_CONNECTION_DEADLINE_MS,
      }),
    });
  }

  /**
   * Disconnects once the HTTP server has closed, so requests still running
   * finish against the database first. Nest calls this hook on the global
   * PrismaModule after every other module's, so background work that waits
   * in its own `onApplicationShutdown` finishes first too.
   */
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
