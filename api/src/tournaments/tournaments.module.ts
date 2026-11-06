import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DraftsModule } from '../drafts/drafts.module.js';
import { DecklistsService } from './decklists.service.js';
import { TournamentsController } from './tournaments.controller.js';
import { TournamentLock } from './tournament-lock.js';
import { TournamentProgressionService } from './tournament-progression.service.js';
import { TournamentReadsService } from './tournament-reads.service.js';
import { TournamentRegistrationService } from './tournament-registration.service.js';
import { TournamentResultsService } from './tournament-results.service.js';

/** Tournaments, which sit beside drafts and reuse their access rules and lock. */
@Module({
  imports: [AuthModule, DraftsModule],
  controllers: [TournamentsController],
  providers: [
    TournamentLock,
    TournamentReadsService,
    TournamentRegistrationService,
    TournamentResultsService,
    TournamentProgressionService,
    DecklistsService,
  ],
})
export class TournamentsModule {}
