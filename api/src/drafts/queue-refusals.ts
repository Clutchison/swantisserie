import type { QueueRefusal } from 'contract';
import type { DraftState } from '../generated/prisma/client.js';
import { NotAPlayerError } from './draft-errors.js';
import { lockPlayer } from './draft-lock.js';
import type { Transaction } from './draft-shapes.js';

export class QueueRefusedError extends Error {
  constructor(readonly refusal: QueueRefusal) {
    super(refusal.message);
  }
}

/**
 * Locks the user's player row in the draft for a change to their queue, as
 * `lockPlayer` does, and returns it with the draft's state. Throws
 * NotAPlayerError if there is no such draft or player, and
 * QueueRefusedError once the draft is closed or complete, when no queue may
 * change.
 */
export async function lockQueue(
  tx: Transaction,
  draftId: string,
  userId: string,
): Promise<{ playerId: string; state: DraftState }> {
  const locked = await lockPlayer(tx, draftId, userId);
  if (!locked) throw new NotAPlayerError('queues');
  checkQueueChangeable(locked.state);
  return locked;
}

/**
 * Throws QueueRefusedError once the draft is closed or complete, when no
 * queue may change.
 */
function checkQueueChangeable(state: DraftState): void {
  if (state === 'Closed') {
    throw new QueueRefusedError({
      error: 'draft-closed',
      message: 'This draft is closed.',
    });
  }
  if (state === 'Complete') {
    throw new QueueRefusedError({
      error: 'draft-complete',
      message: 'This draft is complete.',
    });
  }
}

/**
 * Throws QueueRefusedError in the lobby, where adding to a queue, setting
 * steal behavior and pausing or setting picking a queue wait for the draft
 * to start. A queue already filled in the lobby is kept, and cascades at
 * the start.
 */
export function checkStarted(state: DraftState): void {
  if (state === 'Lobby') {
    throw new QueueRefusedError({
      error: 'not-started',
      message: 'You can queue once the draft starts.',
    });
  }
}
