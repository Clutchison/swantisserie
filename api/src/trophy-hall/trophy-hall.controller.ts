import { Controller, Get, UseGuards } from '@nestjs/common';
import type { TrophyHallView } from 'contract';
import { SessionGuard } from '../auth/session.guard.js';
import { TrophyHallService } from './trophy-hall.service.js';

/** Where signed-in users read the Trophy Hall. */
@Controller('trophy-hall')
@UseGuards(SessionGuard)
export class TrophyHallController {
  constructor(private readonly trophyHall: TrophyHallService) {}

  /** The Trophy Hall of every complete tournament, as TrophyHallService.read groups it. */
  @Get()
  async read(): Promise<TrophyHallView> {
    return this.trophyHall.read();
  }
}
