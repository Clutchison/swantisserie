import { Module } from '@nestjs/common';
import { AppAdminConfig } from './app-admin-config.js';
import { SessionService } from './session.service.js';

/**
 * Sessions and who the app admins are, apart from sign-in, so the drafts
 * gateway can admit sockets without importing AuthModule, which sits above
 * it (`DraftPushesModule`).
 */
@Module({
  providers: [
    SessionService,
    {
      provide: AppAdminConfig,
      useFactory: () => new AppAdminConfig(process.env.ADMIN_DISCORD_IDS),
    },
  ],
  exports: [SessionService, AppAdminConfig],
})
export class SessionModule {}
