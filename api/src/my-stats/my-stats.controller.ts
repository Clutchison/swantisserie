import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MyStatsView } from 'contract';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { MyStatsService } from './my-stats.service.js';

/** Where a signed-in player reads their own My stats: there is no way to ask for another player's. */
@Controller('my-stats')
@UseGuards(SessionGuard)
export class MyStatsController {
  constructor(private readonly myStats: MyStatsService) {}

  /** The signed-in player's My stats, as MyStatsService.read works them out. */
  @Get()
  async read(@CurrentUser() user: SessionUser): Promise<MyStatsView> {
    return this.myStats.read(user.id);
  }
}
