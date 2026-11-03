import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { CubeCobraModule } from '../cubecobra/cubecobra.module.js';
import { ScryfallModule } from '../scryfall/scryfall.module.js';
import { BotPickDelay, BotPlayers } from './bot-players.js';
import { DraftLifecycleService } from './draft-lifecycle.service.js';
import { DraftLobbyService } from './draft-lobby.service.js';
import { DraftLock } from './draft-lock.js';
import { DraftPublisher } from './draft-publisher.js';
import { DraftReadsService } from './draft-reads.service.js';
import { DraftsController } from './drafts.controller.js';
import { DraftsGateway } from './drafts.gateway.js';
import { PickImportService } from './pick-import.service.js';
import { PoolSnapshotService } from './pool-snapshot.service.js';
import { QueuesController } from './queues.controller.js';
import { QueuesService } from './queues.service.js';
import { TurnsService } from './turns.service.js';

@Module({
  imports: [AuthModule, CubeCobraModule, DiscordModule, ScryfallModule],
  controllers: [DraftsController, QueuesController],
  providers: [
    DraftLock,
    DraftReadsService,
    DraftLobbyService,
    PickImportService,
    TurnsService,
    DraftLifecycleService,
    DraftsGateway,
    PoolSnapshotService,
    DraftPublisher,
    QueuesService,
    { provide: BotPickDelay, useValue: new BotPickDelay(1500) },
    BotPlayers,
  ],
})
export class DraftsModule {}
