import type { DraftSize } from './draft-size.js';

/** Whose turn it is: the next pick to make and the seat that makes it. */
export interface Turn {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  /** 1-based; each round gives every seat one pick. */
  round: number;
  /** 0-based index into the seat order. */
  seat: number;
}

/** The next turn after `picksMade` picks, or null once every pick is made. */
export function currentTurn(
  { players, picksPerPlayer }: DraftSize,
  picksMade: number,
): Turn | null {
  if (picksMade >= players * picksPerPlayer) return null;
  const round = Math.floor(picksMade / players);
  const place = picksMade % players;
  // Even rounds (counting from 0) run forward, odd ones back.
  const seat = round % 2 === 0 ? place : players - 1 - place;
  return { pick: picksMade + 1, round: round + 1, seat };
}

/**
 * Whether the draft is complete after `picksMade` picks: every player has
 * all their picks.
 */
export function draftComplete(size: DraftSize, picksMade: number): boolean {
  return currentTurn(size, picksMade) === null;
}
