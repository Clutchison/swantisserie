import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BasicLandPrintingsModule } from '../basic-land-printings/basic-land-printings.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { CubeCobraModule } from '../cubecobra/cubecobra.module.js';
import { ScryfallModule } from '../scryfall/scryfall.module.js';
import { SetsModule } from '../sets/sets.module.js';
import { BotPickDelay, BotPickRetries, BotPlayers } from './bot-players.js';
import { DraftChanges } from './draft-changes.js';
import { DraftLifecycleService } from './draft-lifecycle.service.js';
import { DraftLobbyService } from './draft-lobby.service.js';
import { DraftLock } from './draft-lock.js';
import { DraftPublisher } from './draft-publisher.js';
import { DraftPushesModule } from './draft-pushes.module.js';
import { DraftsController } from './drafts.controller.js';
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
    DraftPushesModule,
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
    DraftLobbyService,
    PickImportService,
    TurnsService,
    DraftLifecycleService,
    PoolSnapshotService,
    DraftPublisher,
    DraftChanges,
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
  // For the tournaments module, which sits beside drafts, the webhook
  // registry, and every read of many drafts, which goes through draft access:
  // DraftPushesModule for DraftAccess and DraftPushes.
  exports: [DraftPushesModule, DraftLock, DraftPublisher],
})
export class DraftsModule {}
