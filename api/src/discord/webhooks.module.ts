import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AdminWebhooksController,
  WebhooksController,
} from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

// Apart from DiscordModule, which AuthModule imports for sign-in: the
// registry's guards need AuthModule, and the two can't import each other.
@Module({
  imports: [AuthModule],
  controllers: [AdminWebhooksController, WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
