import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { ScryfallModule } from '../scryfall/scryfall.module.js';
import { DraftsController } from './drafts.controller.js';
import { DraftsGateway } from './drafts.gateway.js';
import { DraftsService } from './drafts.service.js';
import { PoolSnapshotService } from './pool-snapshot.service.js';

@Module({
  imports: [AuthModule, DiscordModule, ScryfallModule],
  controllers: [DraftsController],
  providers: [DraftsService, DraftsGateway, PoolSnapshotService],
})
export class DraftsModule {}
