import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { AppAdminConfig } from './app-admin-config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [DiscordModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    {
      provide: AppAdminConfig,
      useFactory: () => new AppAdminConfig(process.env.ADMIN_DISCORD_IDS),
    },
  ],
  // What SessionGuard and AppAdminGuard need: Nest builds a guard inside each
  // module that uses it, from that module's providers and imports.
  exports: [SessionService, AppAdminConfig],
})
export class AuthModule {}
