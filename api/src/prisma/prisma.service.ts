import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        // Unset in production, for pg's default.
        max: Number(process.env.DATABASE_POOL_SIZE) || undefined,
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
