import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DraftPushesModule } from '../drafts/draft-pushes.module.js';
import {
  WebhookRegistryController,
  WebhooksController,
} from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

// Apart from DiscordModule, which AuthModule imports for sign-in: the
// registry's guards need AuthModule, and the two can't import each other.
// DraftPushesModule pushes the drafts a registry change changes.
@Module({
  imports: [AuthModule, DraftPushesModule],
  controllers: [WebhookRegistryController, WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
