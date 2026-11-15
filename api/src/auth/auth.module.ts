import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { DraftPushesModule } from '../drafts/draft-pushes.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionModule } from './session.module.js';

@Module({
  imports: [DiscordModule, DraftPushesModule, SessionModule],
  controllers: [AuthController],
  providers: [AuthService],
  // What SessionGuard and AppAdminGuard need: Nest builds a guard inside each
  // module that uses it, from that module's providers and imports.
  exports: [SessionModule],
})
export class AuthModule {}
