import type { CardImages } from './pool.js';

/** The part of a plan a card is on. */
export type PlanBoard = 'Mainboard' | 'Sideboard';

/** A card in a plan. */
export interface PlannedCardView {
  poolCardId: string;
  name: string;
  /** Whether it is one of the player's picks, rather than an unpicked card they added. */
  picked: boolean;
}

/** The basic lands, in the order the Basic lands modal and the api list them. */
export const BASIC_LANDS = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
] as const;

/** A basic land, which a plan holds by count on each plan board, and a pool never holds. */
export type BasicLand = (typeof BASIC_LANDS)[number];

/** The most copies of one basic land a plan holds. */
export const MOST_BASICS = 99;

/** The copies of one basic land on one plan board of a plan. Never a pool card: no one picks it, and it is never queued. */
export interface PlannedBasicView {
  land: BasicLand;
  board: PlanBoard;
  /** At least 1: a basic with no copies on a plan board isn't listed for it. */
  count: number;
}

/** An unpicked card lost from the plan: another player picked it when no other copy was available for the plan. */
export interface LostCardView {
  poolCardId: string;
  name: string;
  /** The id of the player who picked it: a `PlayerView.id`. */
  pickedBy: string;
}

/** A plan's mainboard and sideboard, with their basic lands: what a deck holds. */
export interface PlanBoards {
  /** Sorted by mana value, then name. */
  mainboard: PlannedCardView[];
  /** Sorted by mana value, then name. */
  sideboard: PlannedCardView[];
  /** Both plan boards' basic lands: the mainboard's first, then the sideboard's, each in the order of `BASIC_LANDS`. */
  basics: PlannedBasicView[];
}

/** A basic land printing on Scryfall: the printing whose art a basic land shows. */
export interface BasicLandPrintingView {
  scryfallId: string;
  set: string;
  collectorNumber: string;
  /** On Scryfall's CDN, `cards.scryfall.io`. */
  images: CardImages;
}

/** A set with at least one English printing of a basic land, and those printings. */
export interface BasicLandPrintingSetView {
  /** Scryfall's set code, lowercase. */
  code: string;
  name: string;
  /** YYYY-MM-DD. */
  releasedAt: string;
  /** In collector-number order. */
  printings: BasicLandPrintingView[];
}

/**
 * One basic land's printings, from `GET /api/basic-land-printings/:land`,
 * for the Printing picker: the newest set first. None while they are being
 * stored for the first time.
 */
export interface BasicLandPrintingsView {
  sets: BasicLandPrintingSetView[];
}

/** A player's preferred printings, by basic land. A basic land with none, which shows its default printing, is absent. */
export type PreferredPrintings = Partial<
  Record<BasicLand, BasicLandPrintingView>
>;

/** The basic land printing to make a player's preferred printing of a basic land, by its Scryfall id. */
export interface PreferredPrintingRequest {
  scryfallId: string;
}

/** Why a preferred printing couldn't be set: the request names no basic land, or no stored printing of it. */
export interface PreferredPrintingProblem {
  error: 'invalid';
  message: string;
}

/** The signed-in player's plan, which only they may see. */
export interface PlanView extends PlanBoards {
  /** What the Plan notice lists: the lost cards, in the order they went, until the player dismisses it. */
  lost: LostCardView[];
  /** Whether the Ready notice shows: a deck change cleared the player's ready during the tournament's registration, and they haven't since dismissed it or marked themselves ready again, nor has registration ended, by Start or by cancelling the tournament. */
  readyNotice: boolean;
  /** The player's preferred printings, which their basic lands show. */
  preferredPrintings: PreferredPrintings;
}

/** The plan board to move a card in a plan to. */
export interface PlanMoveRequest {
  board: PlanBoard;
}

/** How many copies of a basic land a plan's mainboard is to hold: 0 takes it out. */
export interface PlannedBasicCountRequest {
  count: number;
}
