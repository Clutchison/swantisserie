import type { DraftSize } from './draft-size.js';

/** Whose turn it is: the next pick to make and the seat that makes it. */
export interface Turn {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  /** 1-based; each round gives every seat one turn. */
  round: number;
  /** 0-based index into the seat order. */
  seat: number;
  /**
   * The picks the seat still makes before the turn passes: 2 at the start of
   * a double turn, else 1.
   */
  picksBeforeTurnPasses: 1 | 2;
}

/** Where a turn stands in the draft, without whose it is. */
export type TurnPosition = Pick<
  Turn,
  'pick' | 'round' | 'picksBeforeTurnPasses'
>;

/** The next turn after `picksMade` picks, or null once every pick is made. */
export function currentTurn(size: DraftSize, picksMade: number): Turn | null {
  const { players, picksPerPlayer } = size;
  if (picksMade >= players * picksPerPlayer) return null;
  // Walk the rounds to the one holding the next pick: each gives every seat
  // one turn of its picks per turn.
  let round = 1;
  let intoRound = picksMade;
  while (intoRound >= players * picksPerTurn(size, round)) {
    intoRound -= players * picksPerTurn(size, round);
    round += 1;
  }
  const picks = picksPerTurn(size, round);
  return {
    pick: picksMade + 1,
    round,
    seat: seatOnRound(round, Math.floor(intoRound / picks), players),
    picksBeforeTurnPasses: intoRound % picks === 0 ? picks : 1,
  };
}

/**
 * How many of the draft's first rounds are all single turns. Every player has
 * the same picks per player, so these come first and the rest are all double
 * turns.
 */
function roundsOfSingleTurns({ picksPerPlayer, doublePicks }: DraftSize) {
  return picksPerPlayer - doublePicks;
}

/** The draft's last round: its rounds of single turns, then of double turns. */
function lastRound(size: DraftSize) {
  return roundsOfSingleTurns(size) + size.doublePicks / 2;
}

/**
 * The picks each turn of the 1-based `round` makes: 2 in a round of double
 * turns, else 1, including in any round past the draft's last.
 */
export function picksPerTurn(size: DraftSize, round: number): 1 | 2 {
  return round > roundsOfSingleTurns(size) && round <= lastRound(size) ? 2 : 1;
}

/** The seat taking the 0-based `place`th turn of the 1-based `round`. */
export function seatOnRound(
  round: number,
  place: number,
  players: number,
): number {
  return roundRunsForward(round) ? place : players - 1 - place;
}

/**
 * The 1-based pick that started `turn`, which every pick of the turn shares:
 * the pick before on the second pick of a double turn, else its own.
 */
export function turnStartPick(
  size: DraftSize,
  { pick, round, picksBeforeTurnPasses }: TurnPosition,
): number {
  return pick - picksPerTurn(size, round) + picksBeforeTurnPasses;
}

/**
 * The turn once `turn` passes, after the last of its picks, or null if it is
 * the draft's last.
 */
export function turnAfter(
  size: DraftSize,
  { pick, picksBeforeTurnPasses }: TurnPosition,
): Turn | null {
  // Once the turn's last pick is made, it and every pick before are made.
  return currentTurn(size, pick - 1 + picksBeforeTurnPasses);
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
