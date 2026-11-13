/** How many players a draft has and how many picks each makes. */
export interface DraftSize {
  /** Every player has a seat, so this is also the number of seats. */
  players: number;
  picksPerPlayer: number;
  /**
   * How many of each player's last picks they make on double turns; 0 for
   * none.
   */
  doublePicks: number;
}

/**
 * The size of a draft with `players` players, from what it holds of the rest:
 * a stored draft, or a view of one.
 */
export function draftSize(
  { picksPerPlayer, doublePicks }: Omit<DraftSize, 'players'>,
  players: number,
): DraftSize {
  return { players, picksPerPlayer, doublePicks };
}
