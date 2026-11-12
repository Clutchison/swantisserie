import type { QueueRefusal } from 'contract';
import type { DraftState } from '../generated/prisma/client.js';

export class QueueRefusedError extends Error {
  constructor(readonly refusal: QueueRefusal) {
    super(refusal.message);
  }
}

/**
 * Throws QueueRefusedError once the draft is closed or complete, when no
 * queue may change.
 */
export function checkQueueChangeable(state: DraftState): void {
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
