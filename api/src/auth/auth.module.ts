import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { AdminConfig } from './admin-config.js';
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
      provide: AdminConfig,
      useFactory: () => new AdminConfig(process.env.ADMIN_DISCORD_IDS),
    },
  ],
  // What SessionGuard and AdminGuard need: Nest builds a guard inside each
  // module that uses it, from that module's providers and imports.
  exports: [SessionService, AdminConfig],
})
export class AuthModule {}
