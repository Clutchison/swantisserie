/** The part of a plan a card is on. */
export type PlanBoard = 'Mainboard' | 'Sideboard';

/** A card in a plan. */
export interface PlannedCardView {
  poolCardId: string;
  name: string;
  /** Whether it is one of the player's picks, rather than an unpicked card they added. */
  picked: boolean;
}

/** A basic land, which a plan holds by count on its mainboard, and a pool never holds. */
export type BasicLand =
  'Plains' | 'Island' | 'Swamp' | 'Mountain' | 'Forest' | 'Wastes';

/** The copies of one basic land in a plan, always on the mainboard. Never a pool card: no one picks it, and it is never queued. */
export interface PlannedBasicView {
  land: BasicLand;
  /** At least 1: a basic with no copies isn't listed. */
  count: number;
}

/** An unpicked card lost from the plan: another player picked it when no other copy was available for the plan. */
export interface LostCardView {
  poolCardId: string;
  name: string;
  /** The id of the player who picked it: a `PlayerView.id`. */
  pickedBy: string;
}

/** The signed-in player's plan, which only they may see. */
export interface PlanView {
  /** Sorted by mana value, then name. */
  mainboard: PlannedCardView[];
  /** Sorted by mana value, then name. */
  sideboard: PlannedCardView[];
  /** The mainboard's basic lands, in the order Plains, Island, Swamp, Mountain, Forest, Wastes. A sideboard never holds one. */
  basics: PlannedBasicView[];
  /** What the Plan notice lists: the lost cards, in the order they went, until the player dismisses it. */
  lost: LostCardView[];
}

/** The plan board to move a card in a plan to. */
export interface PlanMoveRequest {
  board: PlanBoard;
}

/** How many copies of a basic land a plan's mainboard is to hold: 0 takes it out. */
export interface PlannedBasicCountRequest {
  count: number;
}
