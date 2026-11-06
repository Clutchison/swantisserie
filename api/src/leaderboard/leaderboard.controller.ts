import { Controller, Get, UseGuards } from '@nestjs/common';
import type { LeaderboardView } from 'contract';
import { SessionGuard } from '../auth/session.guard.js';
import { LeaderboardService } from './leaderboard.service.js';

/** Where signed-in users read the leaderboard. */
@Controller('leaderboard')
@UseGuards(SessionGuard)
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  /** The leaderboard of every complete tournament, as LeaderboardService.read ranks it. */
  @Get()
  async read(): Promise<LeaderboardView> {
    return this.leaderboard.read();
  }
}
