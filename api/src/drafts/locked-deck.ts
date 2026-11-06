import type { TournamentState } from '../generated/prisma/client.js';
import type { Transaction } from './draft-shapes.js';

/** The tournament states that lock the decks of the players who have joined. */
const LOCKING_STATES: TournamentState[] = ['Registration', 'Playing'];

/**
 * Whether the player's deck is locked: they have joined a tournament that
 * is in registration or playing.
 */
export async function isDeckLocked(
  tx: Transaction,
  playerId: string,
): Promise<boolean> {
  const entry = await tx.tournamentEntry.findFirst({
    where: { playerId, tournament: { state: { in: LOCKING_STATES } } },
    select: { id: true },
  });
  return entry !== null;
}
