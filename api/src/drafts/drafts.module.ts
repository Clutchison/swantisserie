import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BasicLandPrintingsModule } from '../basic-land-printings/basic-land-printings.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { CubeCobraModule } from '../cubecobra/cubecobra.module.js';
import { ScryfallModule } from '../scryfall/scryfall.module.js';
import { SetsModule } from '../sets/sets.module.js';
import { BotPickDelay, BotPickRetries, BotPlayers } from './bot-players.js';
import { DraftLifecycleService } from './draft-lifecycle.service.js';
import { DraftLobbyService } from './draft-lobby.service.js';
import { DraftLock } from './draft-lock.js';
import { DraftPublisher } from './draft-publisher.js';
import { DraftAccess } from './draft-access.js';
import { DraftReadsService } from './draft-reads.service.js';
import { DraftsController } from './drafts.controller.js';
import { DraftsGateway } from './drafts.gateway.js';
import { PickImportService } from './pick-import.service.js';
import { PreferredPrintingsController } from './preferred-printings.controller.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';
import { PoolSnapshotService } from './pool-snapshot.service.js';
import { QueuesController } from './queues.controller.js';
import { QueuesService } from './queues.service.js';
import { TurnsService } from './turns.service.js';
import { TournamentBadges } from '../tournaments/tournament-badge.js';

@Module({
  imports: [
    AuthModule,
    BasicLandPrintingsModule,
    CubeCobraModule,
    DiscordModule,
    ScryfallModule,
    SetsModule,
  ],
  controllers: [
    DraftsController,
    PlansController,
    PreferredPrintingsController,
    QueuesController,
  ],
  providers: [
    DraftLock,
    DraftAccess,
    DraftReadsService,
    DraftLobbyService,
    PickImportService,
    TurnsService,
    DraftLifecycleService,
    DraftsGateway,
    PoolSnapshotService,
    DraftPublisher,
    QueuesService,
    PlansService,
    { provide: BotPickDelay, useValue: new BotPickDelay(1500) },
    {
      provide: BotPickRetries,
      useValue: new BotPickRetries([1000, 2000, 4000]),
    },
    BotPlayers,
    // The draft list reads tournament badges.
    TournamentBadges,
  ],
  // For the tournaments module, which sits beside drafts.
  exports: [DraftAccess, DraftLock, DraftPublisher],
})
export class DraftsModule {}
