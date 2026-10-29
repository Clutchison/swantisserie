import { Module } from '@nestjs/common';
import { DiscordClient, FetchDiscordClient } from './discord-client.js';
import { DiscordConfig } from './discord-config.js';

@Module({
  providers: [
    {
      provide: DiscordConfig,
      useFactory: () => new DiscordConfig(process.env),
    },
    { provide: DiscordClient, useClass: FetchDiscordClient },
  ],
  exports: [DiscordConfig, DiscordClient],
})
export class DiscordModule {}
