export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

/** What a draft would start with. */
export interface StartState {
  players: number;
  picksPerPlayer: number;
  /** Cards in the frozen pool. */
  poolSize: number;
}

/** Why a draft can't start; the message is for the organizer. */
export interface StartProblem {
  error: 'player-count' | 'pool-too-small';
  message: string;
}

/** Why the draft can't start as it is, or null if it can. */
export function startProblem({
  players,
  picksPerPlayer,
  poolSize,
}: StartState): StartProblem | null {
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
