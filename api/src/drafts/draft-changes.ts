import { Injectable } from '@nestjs/common';
import type { DraftView } from 'contract';
import { BotPlayers } from './bot-players.js';
import type { DraftEvent } from './draft-events.js';
import { DraftPublisher } from './draft-publisher.js';

/** What follows a committed change to a draft made by a request. */
@Injectable()
export class DraftChanges {
  constructor(
    private readonly publisher: DraftPublisher,
    private readonly bots: BotPlayers,
  ) {}

  /**
   * Publishes the change, with its `events`, as DraftPublisher says, and if
   * it leaves the draft on a bot's turn, has the bot pick. Returns the draft
   * as published, or null if there is no such draft.
   */
  async committed(
    draftId: string,
    events: DraftEvent[],
  ): Promise<DraftView | null> {
    const draft = await this.publisher.publish(draftId, events);
    if (draft) this.bots.scheduleNextPick(draftId, events);
    return draft;
  }
}
