import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

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
