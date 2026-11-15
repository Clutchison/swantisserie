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

/** What a player was doing when `checkStarted` refused it in the lobby. */
export type LobbyQueueChange = 'queue' | 'queue-paused' | 'steal-behavior';

const notStartedMessages: Record<LobbyQueueChange, string> = {
  queue: 'You can queue once the draft starts.',
  'queue-paused':
    'You can pause your queue or set it picking once the draft starts.',
  'steal-behavior': 'You can set your steal behavior once the draft starts.',
};

/**
 * Throws QueueRefusedError in the lobby, where adding to a queue (`queue`,
 * which Queue unpicked does too), pausing a queue or setting it picking
 * (`queue-paused`) and setting steal behavior (`steal-behavior`) wait for the
 * draft to start. The refusal is always `not-started`; its message names what
 * the player was doing. A queue already filled in the lobby is kept, and
 * cascades at the start.
 */
export function checkStarted(
  state: DraftState,
  change: LobbyQueueChange,
): void {
  if (state === 'Lobby') {
    throw new QueueRefusedError({
      error: 'not-started',
      message: notStartedMessages[change],
    });
  }
}
