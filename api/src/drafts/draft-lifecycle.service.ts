import { Injectable } from '@nestjs/common';
import { currentTurn } from 'engine';
import { CloseRefusedError, PauseRefusedError } from './draft-errors.js';
import {
  type DraftEvent,
  EVENT_PLAYER,
  toEventPlayer,
} from './draft-events.js';
import { DraftLock, type LockedDraft } from './draft-lock.js';
import { draftSize, SEAT_ORDER } from './draft-shapes.js';
import { TurnsService } from './turns.service.js';

/** A started draft's pauses, resumes, closes and reopens. */
@Injectable()
export class DraftLifecycleService {
  constructor(
    private readonly lock: DraftLock,
    private readonly turns: TurnsService,
  ) {}

  /**
   * Moves the draft from Drafting to Paused, so no picks, manual, queued or
   * a bot's, can be made. Throws PauseRefusedError if it isn't Drafting.
   */
  async pause(draftId: string): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Drafting'],
      () =>
        new PauseRefusedError({
          error: 'not-drafting',
          message: 'Only a drafting draft can be paused.',
        }),
      async (draft) => {
        await draft.moveTo('Paused');
        return [{ type: 'paused' }];
      },
    );
  }

  /**
   * Moves the draft from Paused back to Drafting, and picks the cascade
   * from its current turn. Throws PauseRefusedError if it isn't Paused.
   */
  async resume(draftId: string): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Paused'],
      () =>
        new PauseRefusedError({
          error: 'not-paused',
          message: 'Only a paused draft can be resumed.',
        }),
      (draft) => this.backToDrafting(draft, 'resumed'),
    );
  }

  /**
   * Moves the draft from Drafting or Paused to Closed, with every pick as
   * made, so it is read-only until reopened. Throws CloseRefusedError if it
   * is in any other state.
   */
  async close(draftId: string): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Drafting', 'Paused'],
      () =>
        new CloseRefusedError({
          error: 'not-closable',
          message: 'Only a drafting or paused draft can be closed.',
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
   * Moves a Paused or Closed draft to Drafting, and picks the cascade from
   * its current turn. `type` is the event to say so with.
   */
  private async backToDrafting(
    draft: LockedDraft,
    type: 'resumed' | 'reopened',
  ): Promise<DraftEvent[]> {
    const { tx, id: draftId } = draft;
    await draft.moveTo('Drafting');
    // Paused or Closed, so not complete: there is a turn.
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
