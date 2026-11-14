import { Injectable, Logger } from '@nestjs/common';
import type { DraftView } from 'contract';
import { BotPlayers } from './bot-players.js';
import type { DraftEvent } from './draft-events.js';
import { DraftPublisher } from './draft-publisher.js';

/** What follows a committed change to a draft made by a request. */
@Injectable()
export class DraftChanges {
  private readonly logger = new Logger(DraftChanges.name);

  constructor(
    private readonly publisher: DraftPublisher,
    private readonly bots: BotPlayers,
  ) {}

  /**
   * Publishes the change, with its `events`, as DraftPublisher says, and if
   * it leaves the draft on a bot's turn, has the bot pick. Returns the draft
   * as published, or null if there is no such draft. The change has
   * committed, so a failed publish still has the bot pick, as a bot's own
   * pick does: it is logged, then rethrown for the caller to answer.
   */
  async committed(
    draftId: string,
    events: DraftEvent[],
  ): Promise<DraftView | null> {
    let draft: DraftView | null;
    try {
      draft = await this.publisher.publish(draftId, events);
    } catch (err) {
      this.logger.error(`Couldn’t publish a change to draft ${draftId}`, err);
      // The bot's pick does nothing if the draft has gone or moved on.
      this.bots.scheduleNextPick(draftId, events);
      throw err;
    }
    if (draft) this.bots.scheduleNextPick(draftId, events);
    return draft;
  }
}
