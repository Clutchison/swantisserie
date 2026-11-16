import type { Transaction } from './draft-shapes.js';

/**
 * The refusal for a change to a locked deck, its cards, its basics or its
 * queued copies' plan boards, which each change's own error carries.
 */
export const DECK_LOCKED = {
  error: 'deck-locked',
  message:
    'Your deck is locked until this draft’s tournament is complete or cancelled.',
} as const;

/**
 * Whether the player's deck is locked: they have joined a tournament that
 * is playing. During registration it stays open, and it unlocks once the
 * tournament is complete or cancelled.
 */
export async function isDeckLocked(
  tx: Transaction,
  playerId: string,
): Promise<boolean> {
  const entry = await tx.tournamentEntry.findFirst({
    where: { playerId, tournament: { state: 'Playing' } },
    select: { id: true },
  });
  return entry !== null;
}
