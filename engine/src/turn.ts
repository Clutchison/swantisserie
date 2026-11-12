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
  const round = Math.floor(picksMade / players) + 1;
  const place = picksMade % players;
  const seat = roundRunsForward(round) ? place : players - 1 - place;
  return { pick: picksMade + 1, round, seat };
}

/**
 * Who picks next: the turn after the one making the 1-based `pick`, or null
 * if that is the draft's last.
 */
export function nextTurn(size: DraftSize, pick: number): Turn | null {
  // Once `pick` is made, `pick` picks have been made.
  return currentTurn(size, pick);
}

/**
 * Whether the 1-based `round` runs forward, from the first seat to the last,
 * as odd rounds do in snake order; even ones run back.
 */
export function roundRunsForward(round: number): boolean {
  return round % 2 === 1;
}

/**
 * Whether the draft is complete after `picksMade` picks: every player has
 * all their picks.
 */
export function draftComplete(size: DraftSize, picksMade: number): boolean {
  return currentTurn(size, picksMade) === null;
}
