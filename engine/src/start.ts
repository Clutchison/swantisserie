import type { DraftSize } from './draft-size.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

/** Why a draft can't start; the message is for the organizer. */
export interface StartProblem {
  error: 'player-count' | 'pool-too-small';
  message: string;
}

/**
 * Why a draft of this size can't start with `poolSize` cards in its pool,
 * or null if it can.
 */
export function startProblem(
  { players, picksPerPlayer }: DraftSize,
  poolSize: number,
): StartProblem | null {
  if (players < MIN_PLAYERS || players > MAX_PLAYERS) {
    return {
      error: 'player-count',
      message: `A draft needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players to start.`,
    };
  }
  const needed = players * picksPerPlayer;
  if (needed > poolSize) {
    return {
      error: 'pool-too-small',
      message: `${players} players × ${picksPerPlayer} picks needs ${needed} cards, but the pool has ${poolSize}.`,
    };
  }
  return null;
}
