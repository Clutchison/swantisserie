import { Injectable } from '@nestjs/common';
import type { DraftView } from 'contract';
import { DraftNotifier } from '../discord/draft-notifier.js';
import type { DraftEvent } from './draft-events.js';
import { DraftPushes } from './draft-pushes.js';
import { DraftsGateway } from './drafts.gateway.js';

/** Tells the world about a change to a draft, once it is committed. */
@Injectable()
export class DraftPublisher {
  constructor(
    private readonly pushes: DraftPushes,
    private readonly gateway: DraftsGateway,
    private readonly notifier: DraftNotifier,
  ) {}

  /**
   * Announces `events` on the draft's webhook, without waiting for Discord,
   * and sends everyone viewing the draft, and each of `alsoTellUserIds`,
   * how it now is. Returns the draft as sent, or null if there is no such
   * draft.
   */
  async publish(
    draftId: string,
    events: DraftEvent[],
    alsoTellUserIds: string[] = [],
  ): Promise<DraftView | null> {
    // Committed by now, so a failed post can't undo the change.
    if (events.length > 0) void this.notifier.notify(draftId, events);
    return this.pushes.push(draftId, alsoTellUserIds);
  }

  /**
   * Tells everyone viewing the draft, and `playerIds`, its players but the
   * bots, that it was cancelled. A lobby draft has never been announced, so
   * nothing is posted to its webhook.
   */
  cancelled(draftId: string, playerIds: string[]): void {
    this.gateway.cancelled(draftId, playerIds);
  }
}
