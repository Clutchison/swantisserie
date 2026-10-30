import { Injectable, Logger } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import type { DraftEvent } from '../drafts/draft-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscordConfig } from './discord-config.js';
import {
  type AnnouncedDraft,
  draftMessages,
  type WebhookMessage,
} from './draft-messages.js';
import { WebhookClient, WebhookGoneError } from './webhook-client.js';

/** How long to wait before each retry of a failed post. */
export class DraftNotifierRetries {
  constructor(readonly delaysMs: readonly number[]) {}
}

/**
 * Announces draft events on each draft's webhook. Each draft's posts go one
 * at a time, in the order notified, and a failed post is retried, then logged.
 */
@Injectable()
export class DraftNotifier {
  private readonly logger = new Logger(DraftNotifier.name);
  /** Each draft's posts so far, so the next waits for them. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookClient,
    private readonly config: DiscordConfig,
    private readonly retries: DraftNotifierRetries,
  ) {}

  /**
   * Posts the events' announcements to the draft's webhook, if it has one.
   * Call once the events are committed. Never rejects: failures are logged.
   */
  notify(draftId: string, events: DraftEvent[]): Promise<void> {
    const queued = (this.queues.get(draftId) ?? Promise.resolve()).then(() =>
      this.announce(draftId, events).catch((err: unknown) =>
        this.logger.error(
          `Couldn’t announce on draft ${draftId}’s webhook: ${String(err)}`,
        ),
      ),
    );
    this.queues.set(draftId, queued);
    // Forgotten once done, unless more were queued meanwhile.
    void queued.then(() => {
      if (this.queues.get(draftId) === queued) this.queues.delete(draftId);
    });
    return queued;
  }

  private async announce(draftId: string, events: DraftEvent[]): Promise<void> {
    const row = await this.prisma.draft.findUnique({
      where: { id: draftId },
      select: { name: true, webhook: { select: { url: true } } },
    });
    if (!row?.webhook) return;
    const draft: AnnouncedDraft = {
      name: row.name,
      url: new URL(`/drafts/${draftId}`, this.config.redirectUri).href,
    };
    for (const message of draftMessages(draft, events)) {
      try {
        await this.post(row.webhook.url, message);
      } catch (err) {
        this.logger.error(
          `Couldn’t post an announcement on draft ${draftId}: ${String(err)}`,
        );
      }
    }
  }

  /** Posts `message`, retrying after each of the retry delays. */
  private async post(url: string, message: WebhookMessage): Promise<void> {
    for (const delay of this.retries.delaysMs) {
      try {
        return await this.webhooks.post(url, message);
      } catch (err) {
        if (err instanceof WebhookGoneError) throw err;
        await setTimeout(delay);
      }
    }
    await this.webhooks.post(url, message);
  }
}
