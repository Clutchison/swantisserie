/** How many players a draft has and how many picks each makes. */
export interface DraftSize {
  /** Every player has a seat, so this is also the number of seats. */
  players: number;
  picksPerPlayer: number;
}
