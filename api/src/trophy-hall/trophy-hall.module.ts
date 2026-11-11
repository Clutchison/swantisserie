import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SetsModule } from '../sets/sets.module.js';
import { TrophyHallController } from './trophy-hall.controller.js';
import { TrophyHallService } from './trophy-hall.service.js';

@Module({
  imports: [AuthModule, SetsModule],
  controllers: [TrophyHallController],
  providers: [TrophyHallService],
})
export class TrophyHallModule {}
