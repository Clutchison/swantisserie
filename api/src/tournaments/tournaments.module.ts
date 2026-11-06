import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DraftsModule } from '../drafts/drafts.module.js';
import { TournamentsController } from './tournaments.controller.js';
import { TournamentsService } from './tournaments.service.js';

/** Tournaments, which sit beside drafts and reuse their access rules and lock. */
@Module({
  imports: [AuthModule, DraftsModule],
  controllers: [TournamentsController],
  providers: [TournamentsService],
})
export class TournamentsModule {}
