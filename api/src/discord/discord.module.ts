import { Module } from '@nestjs/common';
import { DiscordClient, FetchDiscordClient } from './discord-client.js';
import { DiscordConfig } from './discord-config.js';
import { DraftNotifier, DraftNotifierRetries } from './draft-notifier.js';
import { FetchWebhookClient, WebhookClient } from './webhook-client.js';

@Module({
  providers: [
    {
      provide: DiscordConfig,
      useFactory: () => new DiscordConfig(process.env),
    },
    { provide: DiscordClient, useClass: FetchDiscordClient },
    { provide: WebhookClient, useClass: FetchWebhookClient },
    {
      provide: DraftNotifierRetries,
      useValue: new DraftNotifierRetries([1000, 5000]),
    },
    DraftNotifier,
  ],
  exports: [DiscordConfig, DiscordClient, DraftNotifier],
})
export class DiscordModule {}
