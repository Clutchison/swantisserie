import { startProblem } from 'engine';
import type { Draft } from '../generated/prisma/client.js';
import { StartRefusedError } from './draft-errors.js';
import type { LockedDraft } from './draft-lock.js';
import { draftSize, type Transaction } from './draft-shapes.js';

/** What the start checks read of a draft, locked or not. */
export type StartableDraft = Pick<
  Draft,
  'id' | 'picksPerPlayer' | 'snapshotState'
>;

/**
 * Throws StartRefusedError if the draft, with `players` players, can't
 * start: its pool snapshot isn't complete, or a start check fails.
 */
export async function checkCanStart(
  client: Pick<Transaction, 'poolCard'>,
  draft: StartableDraft,
  players: number,
): Promise<void> {
  if (draft.snapshotState !== 'Complete') {
    throw new StartRefusedError({
      error: 'pool-not-ready',
      message: 'The pool snapshot isn’t complete yet.',
    });
  }
  const problem = startProblem(
    draftSize(draft, players),
    await client.poolCard.count({ where: { draftId: draft.id } }),
  );
  if (problem) throw new StartRefusedError(problem);
}

/** Seats the draft's players in the order of their user ids. */
export async function seatPlayers(
  { tx, id: draftId }: LockedDraft,
  userIds: string[],
): Promise<void> {
  for (const [seat, userId] of userIds.entries()) {
    await tx.player.update({
      where: { draftId_userId: { draftId, userId } },
      data: { seat },
    });
  }
}
