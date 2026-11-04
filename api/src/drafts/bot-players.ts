import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { DraftEvent } from './draft-events.js';
import { DraftPublisher } from './draft-publisher.js';
import { type BotTurn, TurnsService } from './turns.service.js';

/** How long a bot waits before each pick, so its picks arrive one at a time. */
export class BotPickDelay {
  constructor(readonly ms: number) {}
}

/** How long a bot waits before each retry of a failed pick. */
export class BotPickRetries {
  constructor(readonly delaysMs: readonly number[]) {}
}

/**
 * Makes bots' picks: when a draft's turn passes to a bot, it picks a random
 * available card after a delay, through the same path as anyone's pick.
 */
@Injectable()
export class BotPlayers implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BotPlayers.name);
  /** Each draft's next bot pick, waiting on its delay. */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /**
   * Each draft's latest scheduled bot pick, until it is made, so a failing
   * pick can tell whether something has scheduled another since.
   */
  private readonly latest = new Map<string, object>();
  /** Bot picks being made, so shutdown can wait for them. */
  private readonly picking = new Set<Promise<void>>();
  /** Set on shutdown, so a pick finishing meanwhile schedules no more. */
  private stopping = false;

  constructor(
    private readonly turns: TurnsService,
    private readonly publisher: DraftPublisher,
    private readonly delay: BotPickDelay,
    private readonly retries: BotPickRetries,
  ) {}

  /**
   * Resumes drafts a previous process left on a bot's turn. If that fails
   * the app still starts, and those drafts wait for the next boot.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const turn of await this.turns.botTurns()) this.schedule(turn);
    } catch (err) {
      this.logger.error('Could not resume bots’ turns', err);
    }
  }

  /** Cancels pending picks and retries, and lets those being made finish. */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.all(this.picking);
  }

  /**
   * Schedules the next bot's pick if `events`, a committed change to the
   * draft, leave it on a bot's turn.
   */
  scheduleNextPick(draftId: string, events: DraftEvent[]): void {
    const turn = botTurn(draftId, events);
    if (turn) this.schedule(turn);
  }

  /**
   * Has the bot make its pick after `delayMs`; replaces any pick or retry
   * pending. `failedTries` counts this turn's tries that have failed.
   */
  private schedule(
    turn: BotTurn,
    delayMs = this.delay.ms,
    failedTries = 0,
  ): void {
    if (this.stopping) return;
    const { draftId } = turn;
    clearTimeout(this.timers.get(draftId));
    const scheduled = {};
    this.latest.set(draftId, scheduled);
    const timer = setTimeout(() => {
      this.timers.delete(draftId);
      const picking = this.pick(turn, failedTries, scheduled);
      this.picking.add(picking);
      void picking.finally(() => {
        this.picking.delete(picking);
        if (this.latest.get(draftId) === scheduled) this.latest.delete(draftId);
      });
    }, delayMs);
    this.timers.set(draftId, timer);
  }

  private async pick(
    turn: BotTurn,
    failedTries: number,
    scheduled: object,
  ): Promise<void> {
    const which = `pick ${turn.pick} in draft ${turn.draftId}`;
    let events: DraftEvent[];
    try {
      events = await this.turns.botPick(turn);
    } catch (err) {
      const message = `Bot couldn’t make ${which}`;
      // Something else has the bot's next pick in hand: shutdown, or a
      // newer schedule that a retry would replace.
      if (this.stopping || this.latest.get(turn.draftId) !== scheduled) {
        this.logger.warn(`${message}; not retrying, superseded`, err);
        return;
      }
      const delayMs = this.retries.delaysMs[failedTries];
      if (delayMs === undefined) {
        this.logger.error(`${message}; gave up`, err);
        return;
      }
      // Nothing committed, and `botPick` does nothing once the turn has
      // moved on, so the same turn is safe to try again.
      this.logger.warn(`${message}; retrying in ${delayMs} ms`, err);
      this.schedule(turn, delayMs, failedTries + 1);
      return;
    }
    // Empty if the turn moved on meanwhile: nothing to do.
    if (events.length === 0) return;
    try {
      await this.publisher.publish(turn.draftId, events);
    } catch (err) {
      this.logger.error(`Couldn’t publish bot ${which}`, err);
    }
    // Committed by now, so the next bot picks even if publishing failed.
    this.scheduleNextPick(turn.draftId, events);
  }
}

/** The bot's turn that `events` leave the draft on, if they do. */
function botTurn(draftId: string, events: DraftEvent[]): BotTurn | null {
  const last = events.at(-1);
  if (last?.type === 'started' && last.seats[0]?.isBot) {
    return { draftId, userId: last.seats[0].id, pick: 1 };
  }
  if (last?.type === 'picked' && last.next?.isBot) {
    return { draftId, userId: last.next.id, pick: last.number + 1 };
  }
  if (
    (last?.type === 'undone' ||
      last?.type === 'resumed' ||
      last?.type === 'reopened') &&
    last.player.isBot
  ) {
    return { draftId, userId: last.player.id, pick: last.number };
  }
  return null;
}
