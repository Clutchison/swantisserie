/** The part of a plan a card is on. */
export type PlanBoard = 'Mainboard' | 'Sideboard';

/** A card in a plan. */
export interface PlannedCardView {
  poolCardId: string;
  name: string;
  /** Whether it is one of the player's picks, rather than an unpicked card they added. */
  picked: boolean;
}

/** A basic land, which a plan holds by count rather than as pool cards. */
export type BasicLand =
  'Plains' | 'Island' | 'Swamp' | 'Mountain' | 'Forest' | 'Wastes';

/** The copies of one basic land on one board of a plan. Never a pool card: no one picks it, and it is never queued. */
export interface PlannedBasicView {
  land: BasicLand;
  board: PlanBoard;
  /** At least 1: a basic with no copies on a board isn't listed for it. */
  count: number;
}

/** An unpicked card lost from the plan: another player picked it when no other copy was available for the plan. */
export interface LostCardView {
  poolCardId: string;
  name: string;
  /** The name of the player who picked it. */
  pickedBy: string;
}

/** The signed-in player's plan, which only they may see. */
export interface PlanView {
  /** Sorted by mana value, then name. */
  mainboard: PlannedCardView[];
  /** Sorted by mana value, then name. */
  sideboard: PlannedCardView[];
  /** The mainboard's basics, then the sideboard's, each in the order Plains, Island, Swamp, Mountain, Forest, Wastes. */
  basics: PlannedBasicView[];
  /** What the Plan notice lists: the lost cards, in the order they went, until the player dismisses it. */
  lost: LostCardView[];
}
