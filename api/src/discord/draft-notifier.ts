import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { Deadline, DeadlinePassedError } from '../deadline.js';
import type { DraftEvent } from '../drafts/draft-events.js';
import { DraftPushes } from '../drafts/draft-pushes.js';
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
  WebhookRateLimitedError,
  WebhookRefusedError,
} from './webhook-client.js';

/**
 * How long shutdown waits for queued announcements, measured from when
 * shutdown starts: the notifier's `onModuleDestroy`. Nest calls that before
 * it closes the HTTP server, so the wait for requests in flight counts against
 * it; only shallower modules' own `onModuleDestroy` (the bots' brief wait for
 * picks already being made) comes before. Stays under Heroku's 30 s from
 * SIGTERM to SIGKILL, leaving time for the database to disconnect after it.
 */
export const SHUTDOWN_DEADLINE_MS = 25_000;

/**
 * The longest a post waits out a Discord rate limit. While a webhook's rate
 * limit has longer than this left, its posts are dropped without a request,
 * which would only be rate limited too and count towards Discord's limit on
 * invalid requests. A webhook's usual limit is per channel, about 30 posts a
 * minute, so its waits stay within a minute; a longer one means something
 * worse, such as a global or Cloudflare limit, and waiting it out would stall
 * every announcement on the webhook. Above the shutdown deadline, which ends
 * any wait still going at shutdown.
 */
export const RATE_LIMIT_CAP_MS = 60_000;

/**
 * The shortest a webhook stays rate limited, however little Discord says:
 * a `retry_after` of 0 (Discord gives it to the millisecond, and may round
 * down) would let the next try go at once and spend it on another 429.
 */
export const RATE_LIMIT_MIN_WAIT_MS = 500;

/**
 * Thrown, without a request, for a post on a webhook whose rate limit has
 * longer than RATE_LIMIT_CAP_MS left: the post is dropped. Named in its
 * message, so the log says what dropped it.
 */
export class RateLimitPastCapError extends Error {
  override readonly name = 'RateLimitPastCapError';

  constructor(readonly leftMs: number) {
    super(
      `Discord rate limited the webhook for another ${leftMs} ms, longer than the ${RATE_LIMIT_CAP_MS} ms a post waits, so the post was dropped.`,
    );
  }
}

/** An announcement queued or still sending, which shutdown may drop. */
interface Announcement {
  draftId: string;
  events: DraftEvent[];
  /** Whether its posts have started: some may have gone, or still go. */
  sending: boolean;
}

/** A rate limited webhook, or one whose waiting posts are still going. */
interface RateLimitedWebhook {
  /** When it takes posts again (`Date.now()` time). */
  until: number;
  /**
   * Its waiting posts, if any: settles once the last post to join them has
   * landed or failed. Posts that join while it is rate limited, or while its
   * waiting posts are still going, go one at a time in the order they joined.
   */
  waiting?: Promise<void>;
}

/** How long to wait before each retry of a failed post. */
export class DraftNotifierRetries {
  constructor(readonly delaysMs: readonly number[]) {}
}

/**
 * Announces draft events on each draft's webhook. Each draft's posts go one
 * at a time, in the order notified, and a failed post is retried if a retry
 * may help, then logged. When Discord rate limits a post, every post on that
 * webhook, from any draft, waits as long as Discord says; a post that would
 * wait longer than RATE_LIMIT_CAP_MS is logged and dropped. Once the rate
 * limit ends, the posts that waited go one at a time, each after the one before
 * has landed or failed, in the order they started waiting, and a post that
 * arrives meanwhile waits behind them. A post that finds
 * the webhook gone marks it so, nothing more is posted on it until its URL is
 * replaced, and every draft using it is pushed showing it gone. At shutdown,
 * posts go on until the shutdown deadline; then those still queued or sending
 * are logged as dropped, and no new post starts.
 */
@Injectable()
export class DraftNotifier implements OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(DraftNotifier.name);
  /** Each draft's posts so far, so the next waits for them. */
  private readonly queues = new Map<string, Promise<void>>();
  /** Announcements queued or still sending, which shutdown may drop. */
  private readonly pending = new Set<Announcement>();
  /** Set when shutdown starts, in `onModuleDestroy`. */
  private shutdownDeadline?: Deadline;
  /** Aborted once the shutdown deadline has passed: no new post starts. */
  private readonly pastShutdownDeadline = new AbortController();
  /**
   * Each rate limited webhook, by URL, until it takes posts again and its
   * waiting posts have gone: every post on it, from any draft, waits its turn.
   */
  private readonly rateLimited = new Map<string, RateLimitedWebhook>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookClient,
    private readonly config: DiscordConfig,
    private readonly retries: DraftNotifierRetries,
    private readonly pushes: DraftPushes,
  ) {}

  /** Starts the shutdown deadline's clock, as shutdown starts. */
  onModuleDestroy(): void {
    this.startShutdownDeadline();
  }

  private startShutdownDeadline(): Deadline {
    // Holds the process while raced, so the dropped posts are logged and the
    // database disconnects even if nothing else is keeping it alive.
    return (this.shutdownDeadline ??= new Deadline(
      'shutdown',
      SHUTDOWN_DEADLINE_MS,
      { holdsProcess: true },
    ));
  }

  /**
   * Waits for every queued post, retries included, so none is dropped at an
   * ordinary deploy or restart. Keeps waiting while more are queued: by bots
   * finishing their picks and by requests finishing as the HTTP server
   * closed. Waits only until the shutdown deadline, though, which started
   * with shutdown in `onModuleDestroy`: then it logs each announcement still
   * queued or still sending as dropped, naming its draft, starts no new post
   * (a post already sending is left to land or not), and returns. Runs
   * before PrismaService disconnects, as announcing reads the database.
   */
  async onApplicationShutdown(): Promise<void> {
    const deadline = this.startShutdownDeadline();
    try {
      while (this.queues.size > 0) {
        await deadline.race(Promise.all(this.queues.values()));
      }
    } catch (err) {
      if (!(err instanceof DeadlinePassedError)) throw err;
      this.dropPending();
    }
  }

  /** Whether the shutdown deadline has passed, so no new post may start. */
  private get deadlinePassed(): boolean {
    return this.pastShutdownDeadline.signal.aborted;
  }

  /** Drops every announcement still queued or sending, logging each. */
  private dropPending(): void {
    this.pastShutdownDeadline.abort();
    for (const announcement of this.pending) this.logDropped(announcement);
    this.pending.clear();
    this.queues.clear();
  }

  private logDropped({ draftId, events, sending }: Announcement): void {
    const types = events.map((e) => e.type).join(', ');
    const posted = sending
      ? 'may not have been posted, or only in part'
      : 'was not posted';
    this.logger.error(
      `Shutdown dropped an announcement on draft ${draftId} (${types}): the shutdown deadline passed, so it ${posted}.`,
    );
  }

  /**
   * Posts the events' announcements to the draft's webhook, if it has one.
   * Call once the events are committed. Never rejects: failures are logged,
   * as are announcements notified after the shutdown deadline, which are
   * dropped.
   * The webhook is read once the draft's earlier announcements are done: if
   * it changes, those still queued go to the new one, while a batch already
   * sending finishes on the old one.
   */
  notify(draftId: string, events: DraftEvent[]): Promise<void> {
    const announcement: Announcement = { draftId, events, sending: false };
    if (this.deadlinePassed) {
      this.logDropped(announcement);
      return Promise.resolve();
    }
    this.pending.add(announcement);
    const queued = (this.queues.get(draftId) ?? Promise.resolve()).then(
      async () => {
        announcement.sending = true;
        try {
          await this.announce(draftId, events);
        } catch (err) {
          // Once past the deadline, shutdown has logged it as dropped already.
          if (!this.deadlinePassed) {
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
    if (this.deadlinePassed) return;
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
      if (this.deadlinePassed) return;
      try {
        await this.post(webhook.url, message);
      } catch (err) {
        // Shutdown has logged it as dropped, and the database may be gone.
        if (this.deadlinePassed) return;
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
   * Marking it bumps and pushes every draft using it, announcing nothing,
   * through DraftPushes, whose lock order this follows: the webhook's row,
   * then the drafts'. The bump makes these copies newer than the push of the
   * change whose post failed, whichever arrives first. The pushes are
   * awaited, so they stay in the draft's announcement queue.
   */
  private async markGone(
    { id, url }: { id: string; url: string },
    err: WebhookGoneError,
  ): Promise<void> {
    const marked = await this.pushes.changing(async (tx, bump) => {
      const { count } = await tx.webhook.updateMany({
        where: { id, url, goneAt: null },
        data: { goneAt: new Date() },
      });
      if (count) await bump({ webhookId: id });
      return count > 0;
    });
    if (!marked) return;
    this.logger.error(
      `Webhook ${id} is gone, so announcements on it are dropped until its URL is replaced: ${String(err)}`,
    );
  }

  /**
   * Posts `message`, retrying after each of the retry delays unless the
   * failure is one a retry won't fix. A try Discord rate limits counts as one
   * of the tries: it makes every post on the webhook wait as long as Discord
   * said, and the next try waits out that rate limit instead of the delay. A
   * post that finds the webhook rate limited, or its waiting posts still
   * going, joins them and keeps its turn until it lands or fails, retries
   * included. Fails without posting when the rate limit has longer left than
   * RATE_LIMIT_CAP_MS. Gives up without posting once the shutdown deadline
   * has passed.
   */
  private async post(url: string, message: WebhookMessage): Promise<void> {
    let leaveTurn: (() => void) | undefined;
    try {
      for (let tries = 0; ; tries++) {
        if (!leaveTurn && this.mustWaitTurn(url)) {
          leaveTurn = await this.waitTurn(url);
        }
        await this.waitOutRateLimitOrDrop(url);
        if (this.deadlinePassed) return;
        try {
          return await this.webhooks.post(url, message);
        } catch (err) {
          if (
            err instanceof WebhookGoneError ||
            err instanceof WebhookRefusedError
          ) {
            throw err;
          }
          const rateLimited = err instanceof WebhookRateLimitedError;
          if (rateLimited) this.rateLimit(url, err.retryAfterMs);
          const delay = this.retries.delaysMs.at(tries);
          if (delay === undefined) throw err;
          if (!rateLimited) await this.wait(delay);
        }
      }
    } finally {
      leaveTurn?.();
    }
  }

  /**
   * Whether a post on the webhook at `url` must wait its turn: the webhook
   * is rate limited, or its waiting posts are still going.
   */
  private mustWaitTurn(url: string): boolean {
    return (
      this.rateLimitLeftMs(url) > 0 ||
      this.rateLimited.get(url)?.waiting !== undefined
    );
  }

  /**
   * Joins the rate limited webhook's waiting posts, returning once those
   * that joined before have each landed or failed, or the shutdown deadline
   * has passed. Throws, dropping the post without joining, when the rate
   * limit has longer left than RATE_LIMIT_CAP_MS. Returns how to leave,
   * which lets the next post go.
   */
  private async waitTurn(url: string): Promise<() => void> {
    this.dropIfPastCap(url);
    const webhook = this.rateLimited.get(url)!;
    const before = webhook.waiting ?? Promise.resolve();
    let leave!: () => void;
    const left = new Promise<void>((resolve) => (leave = resolve));
    const waiting = before.then(() => left);
    webhook.waiting = waiting;
    // Forgotten once they have all gone, unless more joined meanwhile.
    void waiting.then(() => {
      if (webhook.waiting !== waiting) return;
      webhook.waiting = undefined;
      this.forgetIfOver(url);
    });
    await this.untilDeadline(before);
    return leave;
  }

  /**
   * Rate limits the webhook at `url` for `retryAfterMs`, at least
   * RATE_LIMIT_MIN_WAIT_MS, or longer if it is rate limited longer already.
   */
  private rateLimit(url: string, retryAfterMs: number): void {
    const until = Date.now() + Math.max(retryAfterMs, RATE_LIMIT_MIN_WAIT_MS);
    const webhook = this.rateLimited.get(url);
    if (webhook) webhook.until = Math.max(until, webhook.until);
    else this.rateLimited.set(url, { until });
  }

  /** How long the webhook at `url` stays rate limited: 0 or less if not. */
  private rateLimitLeftMs(url: string): number {
    return (this.rateLimited.get(url)?.until ?? 0) - Date.now();
  }

  /** Forgets the webhook's rate limit once it is over and none wait on it. */
  private forgetIfOver(url: string): void {
    const webhook = this.rateLimited.get(url);
    if (webhook && !webhook.waiting && this.rateLimitLeftMs(url) <= 0) {
      this.rateLimited.delete(url);
    }
  }

  /**
   * Waits until the webhook at `url` is no longer rate limited, or until the
   * shutdown deadline passes if that is sooner. Throws, dropping the post
   * without a request, when the rate limit has longer left than
   * RATE_LIMIT_CAP_MS.
   */
  private async waitOutRateLimitOrDrop(url: string): Promise<void> {
    for (;;) {
      const left = this.rateLimitLeftMs(url);
      if (left <= 0 || this.deadlinePassed) {
        this.forgetIfOver(url);
        return;
      }
      this.dropIfPastCap(url);
      await this.wait(left);
    }
  }

  /**
   * Throws, dropping the post without a request, when the webhook's rate
   * limit has longer left than RATE_LIMIT_CAP_MS.
   */
  private dropIfPastCap(url: string): void {
    const left = this.rateLimitLeftMs(url);
    if (left > RATE_LIMIT_CAP_MS) throw new RateLimitPastCapError(left);
  }

  /** Waits for `promise`, or until the shutdown deadline passes if sooner. */
  private untilDeadline(promise: Promise<void>): Promise<void> {
    const { signal } = this.pastShutdownDeadline;
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done);
        resolve();
      };
      signal.addEventListener('abort', done, { once: true });
      void promise.then(done);
    });
  }

  /** Waits `ms`, or until the shutdown deadline passes if that is sooner. */
  private async wait(ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The global timer, not `node:timers/promises`, so fake timers drive it.
    const elapsed = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    await this.untilDeadline(elapsed);
    clearTimeout(timer);
  }
}
