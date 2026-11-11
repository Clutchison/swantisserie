import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SetsModule } from '../sets/sets.module.js';
import { MyStatsController } from './my-stats.controller.js';
import { MyStatsService } from './my-stats.service.js';

@Module({
  imports: [AuthModule, SetsModule],
  controllers: [MyStatsController],
  providers: [MyStatsService],
})
export class MyStatsModule {}
