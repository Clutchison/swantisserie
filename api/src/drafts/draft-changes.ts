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
    // Undefined if the publish threw: the draft is taken to exist, as the
    // bot's pick does nothing if it has gone or the turn has moved on.
    let draft: DraftView | null | undefined;
    try {
      draft = await this.publisher.publish(draftId, events);
      return draft;
    } catch (err) {
      this.logger.error(`Couldn’t publish a change to draft ${draftId}`, err);
      throw err;
    } finally {
      // Committed by now, so the bot picks whatever the publish did.
      if (draft !== null) this.bots.scheduleNextPick(draftId, events);
    }
  }
}
