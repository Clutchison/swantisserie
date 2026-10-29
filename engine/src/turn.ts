/** Whose turn it is: the next pick to make and the seat that makes it. */
export interface Turn {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  /** 1-based; each round gives every seat one pick. */
  round: number;
  /** 0-based index into the seat order. */
  seat: number;
}

/** Where a draft has got to, as far as turns are concerned. */
export interface TurnState {
  seats: number;
  picksPerPlayer: number;
  picksMade: number;
}

/** The next turn, or null once every pick has been made. */
export function currentTurn({
  seats,
  picksPerPlayer,
  picksMade,
}: TurnState): Turn | null {
  if (picksMade >= seats * picksPerPlayer) return null;
  const round = Math.floor(picksMade / seats);
  const place = picksMade % seats;
  // Even rounds (counting from 0) run forward, odd ones back.
  const seat = round % 2 === 0 ? place : seats - 1 - place;
  return { pick: picksMade + 1, round: round + 1, seat };
}
