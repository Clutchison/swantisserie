import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import type { DraftEvent } from '../drafts/draft-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscordConfig } from './discord-config.js';
import {
  type AnnouncedDraft,
  draftMessages,
  type WebhookMessage,
} from './draft-messages.js';
import {
  WebhookClient,
  WebhookGoneError,
  WebhookRefusedError,
} from './webhook-client.js';

/** How long to wait before each retry of a failed post. */
export class DraftNotifierRetries {
  constructor(readonly delaysMs: readonly number[]) {}
}

/**
 * Announces draft events on each draft's webhook. Each draft's posts go one
 * at a time, in the order notified, and a failed post is retried if a retry
 * may help, then logged. A post that finds the webhook gone marks it so, and
 * nothing more is posted on it until its URL is replaced.
 */
@Injectable()
export class DraftNotifier implements OnApplicationShutdown {
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
   * Waits for every queued post, retries included, so none is dropped at a
   * deploy or restart. Keeps waiting while more are queued: by bots finishing
   * their picks and by requests finishing as the HTTP server closed. Runs
   * before PrismaService disconnects, as announcing reads the database.
   */
  async onApplicationShutdown(): Promise<void> {
    while (this.queues.size > 0) {
      await Promise.all(this.queues.values());
    }
  }

  /**
   * Posts the events' announcements to the draft's webhook, if it has one.
   * Call once the events are committed. Never rejects: failures are logged.
   * The webhook is read when their turn to send comes: if it changes, those
   * still queued go to the new one, while a batch already sending finishes on
   * the old one.
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
      select: {
        name: true,
        webhook: { select: { id: true, url: true, goneAt: true } },
      },
    });
    const webhook = row?.webhook;
    // Announcements on a gone webhook are dropped, not kept for its new URL.
    if (!webhook || webhook.goneAt) return;
    const draft: AnnouncedDraft = {
      name: row.name,
      url: new URL(`/drafts/${draftId}`, this.config.redirectUri).href,
    };
    for (const message of draftMessages(draft, events)) {
      try {
        await this.post(webhook.url, message);
      } catch (err) {
        if (err instanceof WebhookGoneError) {
          // The rest of the announcement would only find it gone too.
          return this.markGone(webhook, err);
        }
        this.logger.error(
          `Couldn’t post an announcement on draft ${draftId}: ${String(err)}`,
        );
      }
    }
  }

  /**
   * Records that the webhook is gone, unless its URL has been replaced since
   * `url` failed or it is already marked, logging it only when marked here.
   */
  private async markGone(
    { id, url }: { id: string; url: string },
    err: WebhookGoneError,
  ): Promise<void> {
    const { count } = await this.prisma.webhook.updateMany({
      where: { id, url, goneAt: null },
      data: { goneAt: new Date() },
    });
    if (count) {
      this.logger.error(
        `Webhook ${id} is gone, so announcements on it are dropped until its URL is replaced: ${String(err)}`,
      );
    }
  }

  /**
   * Posts `message`, retrying after each of the retry delays unless the
   * failure is one a retry won't fix.
   */
  private async post(url: string, message: WebhookMessage): Promise<void> {
    for (const delay of this.retries.delaysMs) {
      try {
        return await this.webhooks.post(url, message);
      } catch (err) {
        if (
          err instanceof WebhookGoneError ||
          err instanceof WebhookRefusedError
        ) {
          throw err;
        }
        await setTimeout(delay);
      }
    }
    await this.webhooks.post(url, message);
  }
}
