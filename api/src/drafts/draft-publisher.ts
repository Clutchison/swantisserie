import { Injectable } from '@nestjs/common';
import { DraftNotifier } from '../discord/draft-notifier.js';
import type { DraftEvent } from './draft-events.js';
import { type DraftView, toDraftView } from './draft-view.js';
import { DraftsGateway } from './drafts.gateway.js';
import { DraftsService } from './drafts.service.js';

/** Tells the world about a change to a draft, once it is committed. */
@Injectable()
export class DraftPublisher {
  constructor(
    private readonly drafts: DraftsService,
    private readonly gateway: DraftsGateway,
    private readonly notifier: DraftNotifier,
  ) {}

  /**
   * Announces `events` on the draft's webhook, without waiting for Discord,
   * and sends everyone viewing the draft how it now is. Returns the draft
   * as sent, or null if there is no such draft.
   */
  async publish(
    draftId: string,
    events: DraftEvent[],
  ): Promise<DraftView | null> {
    // Committed by now, so a failed post can't undo the change.
    if (events.length > 0) void this.notifier.notify(draftId, events);
    const found = await this.drafts.find(draftId);
    if (!found) return null;
    const draft = toDraftView(found);
    this.gateway.changed(draft);
    return draft;
  }

  /**
   * Tells everyone viewing the draft it was cancelled. A lobby draft has
   * never been announced, so nothing is posted to its webhook.
   */
  cancelled(draftId: string): void {
    this.gateway.cancelled(draftId);
  }
}
