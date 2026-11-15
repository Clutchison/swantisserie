import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HealthView } from 'contract';
import { Deadline } from '../deadline.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * How long the health check waits for the database's answer to `SELECT 1`:
 * well under Heroku's 30 s router limit, so a database that has stopped
 * answering shows on the status page as "DB error" within seconds, not as
 * "API unreachable" after the router gives up. It covers a connection
 * already open that stops answering, which the pool's connect timeout
 * doesn't.
 */
export const HEALTH_CHECK_DEADLINE_MS = 5_000;

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether the database answers `SELECT 1` within
   * `HEALTH_CHECK_DEADLINE_MS`. A late answer is ignored: the query isn't
   * cancelled.
   */
  @Get()
  async check(): Promise<HealthView> {
    const deadline = new Deadline('health check', HEALTH_CHECK_DEADLINE_MS);
    try {
      await deadline.race(this.prisma.$queryRaw`SELECT 1`);
    } catch (err) {
      this.logger.error('Database health check failed', err);
      const down: HealthView = { api: 'ok', db: 'error' };
      throw new ServiceUnavailableException(down);
    }
    return { api: 'ok', db: 'ok' };
  }
}
