import type { Transaction } from './draft-shapes.js';

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
