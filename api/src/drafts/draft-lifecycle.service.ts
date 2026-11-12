import { Injectable } from '@nestjs/common';
import { currentTurn } from 'engine';
import {
  CloseRefusedError,
  DraftGoneError,
  FreezeRefusedError,
  refuseUnchoosableWebhook,
  rethrowMissingWebhook,
} from './draft-errors.js';
import {
  type DraftEvent,
  EVENT_PLAYER,
  toEventPlayer,
} from './draft-events.js';
import { DraftLock, type LockedDraft } from './draft-lock.js';
import { draftSize, SEAT_ORDER } from './draft-shapes.js';
import { TurnsService } from './turns.service.js';

/** A draft's webhook changes, and a started draft's freezes, unfreezes, closes and reopens. */
@Injectable()
export class DraftLifecycleService {
  constructor(
    private readonly lock: DraftLock,
    private readonly turns: TurnsService,
  ) {}

  /**
   * Chooses the webhook the draft's later announcements are posted to, null
   * for none, in any state. Throws UnknownWebhookError if it doesn't exist,
   * GoneWebhookChosenError if it is gone,
   * and DraftGoneError if the draft doesn't.
   */
  async changeWebhook(
    draftId: string,
    webhookId: string | null,
  ): Promise<void> {
    await this.lock.run(draftId, async (draft) => {
      if (!draft) throw new DraftGoneError();
      await refuseUnchoosableWebhook(draft.tx, webhookId);
      await draft.tx.draft
        .update({ where: { id: draftId }, data: { webhookId } })
        .catch(rethrowMissingWebhook);
    });
  }

  /**
   * Moves the draft from Drafting to Frozen, so no picks, manual, queued or
   * a bot's, can be made. Throws FreezeRefusedError if it isn't Drafting.
   */
  async freeze(draftId: string): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Drafting'],
      () =>
        new FreezeRefusedError({
          error: 'not-drafting',
          message: 'Only a drafting draft can be frozen.',
        }),
      async (draft) => {
        await draft.moveTo('Frozen');
        return [{ type: 'frozen' }];
      },
    );
  }

  /**
   * Moves the draft from Frozen back to Drafting, and picks the cascade
   * from its current turn. Throws FreezeRefusedError if it isn't Frozen.
   */
  async unfreeze(draftId: string): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Frozen'],
      () =>
        new FreezeRefusedError({
          error: 'not-frozen',
          message: 'Only a frozen draft can be unfrozen.',
        }),
      (draft) => this.backToDrafting(draft, 'unfrozen'),
    );
  }

  /**
   * Moves the draft from Drafting or Frozen to Closed, with every pick as
   * made, so it is read-only until reopened. Throws CloseRefusedError if it
   * is in any other state.
   */
  async close(draftId: string): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Drafting', 'Frozen'],
      () =>
        new CloseRefusedError({
          error: 'not-closable',
          message: 'Only a drafting or frozen draft can be closed.',
        }),
      async (draft) => {
        await draft.moveTo('Closed');
        return [{ type: 'closed' }];
      },
    );
  }

  /**
   * Moves the draft from Closed to Drafting, whatever it was when closed,
   * and picks the cascade from its current turn. Throws CloseRefusedError if
   * it isn't Closed.
   */
  async reopen(draftId: string): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Closed'],
      () =>
        new CloseRefusedError({
          error: 'not-closed',
          message: 'Only a closed draft can be reopened.',
        }),
      (draft) => this.backToDrafting(draft, 'reopened'),
    );
  }

  /**
   * Moves a Frozen or Closed draft to Drafting, and picks the cascade from
   * its current turn. `type` is the event to say so with.
   */
  private async backToDrafting(
    draft: LockedDraft,
    type: 'unfrozen' | 'reopened',
  ): Promise<DraftEvent[]> {
    const { tx, id: draftId } = draft;
    await draft.moveTo('Drafting');
    // Frozen or Closed, so not complete: there is a turn.
    const players = await tx.player.findMany({
      where: { draftId },
      orderBy: SEAT_ORDER,
      select: EVENT_PLAYER,
    });
    const turn = currentTurn(
      draftSize(draft, players.length),
      await tx.pick.count({ where: { draftId } }),
    )!;
    return [
      {
        type,
        number: turn.pick,
        player: toEventPlayer(players[turn.seat]),
      },
      ...(await this.turns.cascade(draft)),
    ];
  }
}
