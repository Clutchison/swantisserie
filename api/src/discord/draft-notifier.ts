import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import { Deadline, DeadlinePassedError } from '../deadline.js';
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

/**
 * How long shutdown waits for queued announcements, from when it starts.
 * Stays under Heroku's 30 s from SIGTERM to SIGKILL, leaving time for the
 * database to disconnect after it.
 */
export const SHUTDOWN_DEADLINE_MS = 25_000;

/** How long to wait before each retry of a failed post. */
export class DraftNotifierRetries {
  constructor(readonly delaysMs: readonly number[]) {}
}

/**
 * Announces draft events on each draft's webhook. Each draft's posts go one
 * at a time, in the order notified, and a failed post is retried if a retry
 * may help, then logged. A post that finds the webhook gone marks it so, and
 * nothing more is posted on it until its URL is replaced. At shutdown, posts
 * go on until the shutdown deadline; then those still queued or sending are
 * logged as dropped, and no new post starts.
 */
@Injectable()
export class DraftNotifier implements OnApplicationShutdown {
  private readonly logger = new Logger(DraftNotifier.name);
  /** Each draft's posts so far, so the next waits for them. */
  private readonly queues = new Map<string, Promise<void>>();
  /** Announcements queued or still sending, which shutdown may drop. */
  private readonly pending = new Set<{
    draftId: string;
    events: DraftEvent[];
  }>();
  /** Aborted once the shutdown deadline has passed: no new post starts. */
  private readonly stopping = new AbortController();

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookClient,
    private readonly config: DiscordConfig,
    private readonly retries: DraftNotifierRetries,
  ) {}

  /**
   * Waits for every queued post, retries included, so none is dropped at an
   * ordinary deploy or restart. Keeps waiting while more are queued: by bots
   * finishing their picks and by requests finishing as the HTTP server
   * closed. Waits only until the shutdown deadline, though: then it logs each
   * announcement still queued or still sending as dropped, naming its draft,
   * starts no new post (a post already sending is left to finish or not), and
   * returns. Runs before PrismaService disconnects, as announcing reads the
   * database.
   */
  async onApplicationShutdown(): Promise<void> {
    // Holds the process, so the dropped posts are logged and the database
    // disconnects even if nothing else is keeping it alive.
    const deadline = new Deadline('shutdown', SHUTDOWN_DEADLINE_MS, {
      holdsProcess: true,
    });
    try {
      while (this.queues.size > 0) {
        await deadline.race(Promise.all(this.queues.values()));
      }
    } catch (err) {
      if (!(err instanceof DeadlinePassedError)) throw err;
      this.stop();
    }
  }

  /** Whether the shutdown deadline has passed, so no new post may start. */
  private get stopped(): boolean {
    return this.stopping.signal.aborted;
  }

  /** Drops every announcement still queued or sending, logging each. */
  private stop(): void {
    this.stopping.abort();
    for (const announcement of this.pending) this.logDropped(announcement);
    this.pending.clear();
    this.queues.clear();
  }

  private logDropped({
    draftId,
    events,
  }: {
    draftId: string;
    events: DraftEvent[];
  }): void {
    this.logger.error(
      `Shutdown dropped an announcement on draft ${draftId} (${events.map((e) => e.type).join(', ')}): the shutdown deadline passed before it was posted.`,
    );
  }

  /**
   * Posts the events' announcements to the draft's webhook, if it has one.
   * Call once the events are committed. Never rejects: failures are logged,
   * as are announcements notified after the shutdown deadline, which are
   * dropped.
   * The webhook is read when their turn to send comes: if it changes, those
   * still queued go to the new one, while a batch already sending finishes on
   * the old one.
   */
  notify(draftId: string, events: DraftEvent[]): Promise<void> {
    const announcement = { draftId, events };
    if (this.stopped) {
      this.logDropped(announcement);
      return Promise.resolve();
    }
    this.pending.add(announcement);
    const queued = (this.queues.get(draftId) ?? Promise.resolve()).then(
      async () => {
        try {
          await this.announce(draftId, events);
        } catch (err) {
          // Once stopped, shutdown has logged it as dropped already.
          if (!this.stopped) {
            this.logger.error(
              `Couldn’t announce on draft ${draftId}’s webhook: ${String(err)}`,
            );
          }
        } finally {
          this.pending.delete(announcement);
        }
      },
    );
    this.queues.set(draftId, queued);
    // Forgotten once done, unless more were queued meanwhile.
    void queued.then(() => {
      if (this.queues.get(draftId) === queued) this.queues.delete(draftId);
    });
    return queued;
  }

  private async announce(draftId: string, events: DraftEvent[]): Promise<void> {
    if (this.stopped) return;
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
      if (this.stopped) return;
      try {
        await this.post(webhook.url, message);
      } catch (err) {
        // Shutdown has logged it as dropped, and the database may be gone.
        if (this.stopped) return;
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
   * failure is one a retry won't fix. Gives up without posting once the
   * shutdown deadline has passed.
   */
  private async post(url: string, message: WebhookMessage): Promise<void> {
    for (const delay of this.retries.delaysMs) {
      if (this.stopped) return;
      try {
        return await this.webhooks.post(url, message);
      } catch (err) {
        if (
          err instanceof WebhookGoneError ||
          err instanceof WebhookRefusedError
        ) {
          throw err;
        }
        await this.wait(delay);
      }
    }
    if (this.stopped) return;
    await this.webhooks.post(url, message);
  }

  /** Waits `ms`, or until the shutdown deadline passes if that is sooner. */
  private async wait(ms: number): Promise<void> {
    try {
      await setTimeout(ms, undefined, { signal: this.stopping.signal });
    } catch (err) {
      if (!this.stopped) throw err;
    }
  }
}
