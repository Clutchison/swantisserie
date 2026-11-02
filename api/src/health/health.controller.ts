import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HealthView } from 'contract';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthView> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      this.logger.error('Database health check failed', err);
      const down: HealthView = { api: 'ok', db: 'error' };
      throw new ServiceUnavailableException(down);
    }
    return { api: 'ok', db: 'ok' };
  }
}
