import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LeaderboardController } from './leaderboard.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [LeaderboardController],
})
export class LeaderboardModule {}
