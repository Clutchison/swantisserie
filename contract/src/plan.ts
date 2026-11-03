/** The part of a plan a card is on. */
export type PlanBoard = 'Mainboard' | 'Sideboard';

/** A card in a plan. */
export interface PlannedCardView {
  poolCardId: string;
  name: string;
}

/** The signed-in player's plan, which only they may see. */
export interface PlanView {
  /** Sorted by mana value, then name. */
  mainboard: PlannedCardView[];
  /** Sorted by mana value, then name. */
  sideboard: PlannedCardView[];
}
