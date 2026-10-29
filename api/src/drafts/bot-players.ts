import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { DraftEvent } from './draft-events.js';
import { DraftPublisher } from './draft-publisher.js';
import { type BotTurn, DraftsService } from './drafts.service.js';

/** How long a bot waits before each pick, so its picks arrive one at a time. */
export class BotPickDelay {
  constructor(readonly ms: number) {}
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
  /** Bot picks being made, so shutdown can wait for them. */
  private readonly picking = new Set<Promise<void>>();
  /** Set on shutdown, so a pick finishing meanwhile schedules no more. */
  private stopping = false;

  constructor(
    private readonly drafts: DraftsService,
    private readonly publisher: DraftPublisher,
    private readonly delay: BotPickDelay,
  ) {}

  /**
   * Resumes drafts a previous process left on a bot's turn. If that fails
   * the app still starts, and those drafts wait for the next boot.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      for (const turn of await this.drafts.botTurns()) this.schedule(turn);
    } catch (err) {
      this.logger.error('Could not resume bots’ turns', err);
    }
  }

  /** Cancels pending picks and lets those being made finish. */
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

  /** Has the bot make its pick after the delay; replaces any pick pending. */
  private schedule(turn: BotTurn): void {
    if (this.stopping) return;
    clearTimeout(this.timers.get(turn.draftId));
    const timer = setTimeout(() => {
      this.timers.delete(turn.draftId);
      const picking = this.pick(turn);
      this.picking.add(picking);
      void picking.finally(() => this.picking.delete(picking));
    }, this.delay.ms);
    this.timers.set(turn.draftId, timer);
  }

  private async pick(turn: BotTurn): Promise<void> {
    try {
      const events = await this.drafts.botPick(turn);
      // Empty if the turn moved on meanwhile: nothing to do.
      if (events.length === 0) return;
      await this.publisher.publish(turn.draftId, events);
      this.scheduleNextPick(turn.draftId, events);
    } catch (err) {
      this.logger.error(
        `Bot couldn’t make pick ${turn.pick} in draft ${turn.draftId}`,
        err,
      );
    }
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
  return null;
}
