import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DiscordClient, FetchDiscordClient } from './discord-client.js';
import { DiscordConfig, discordConfigFromEnv } from './discord-config.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: DiscordConfig, useFactory: discordConfigFromEnv },
    { provide: DiscordClient, useClass: FetchDiscordClient },
    AuthService,
    SessionService,
    SessionGuard,
  ],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
