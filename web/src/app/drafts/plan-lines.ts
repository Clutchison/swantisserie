import {
  PLAN_BOARDS,
  type BasicLand,
  type PlanBoard,
  type PlannedBasicView,
  type PlannedCardView,
  type PlanView,
  type QueuedCardView,
} from 'contract';
import { basicsOn, cardsOn, type PlanBoardsOf } from './plan-boards';

/**
 * A card on a plan board as the Deck tab shows it: a pick, a copy of a
 * basic land, which counts as picked, or a queued card, which isn't. A
 * basic's `poolCardId` is no pool card's, but keys its card data in the
 * tab's `cardsById`.
 */
export interface PlanBoardCard extends PlannedCardView {
  basic?: BasicLand;
  /** A queued card's 1-based place in the player's queue, which its Queued badge shows; none for any other card. */
  queuePlace?: number;
}

/**
 * What a card on a plan board is: a pick, a copy of a basic land, or a
 * queued card. A pick or a basic land's copy counts as picked; a queued card
 * is dimmed.
 */
export type PlanBoardCardKind = 'picked' | 'basic' | 'queued';

/** What `card` is, as `PlanBoardCardKind` names it. */
export function kindOf(card: PlanBoardCard): PlanBoardCardKind {
  if (card.queuePlace) return 'queued';
  return card.basic ? 'basic' : 'picked';
}

/**
 * The deck as the Deck tab shows it: the plan, with the queued cards its
 * player's picks left can reach.
 */
export interface ShownPlan extends PlanView {
  mainboard: PlanBoardCard[];
  sideboard: PlanBoardCard[];
}

/**
 * The deck `plan` shows with the cards of `queue` that `reaches` says the
 * player's picks left reach, by their 0-based place in it: each plan
 * board's picks, then the reached queued cards on it, in queue order, each
 * with its place in the queue.
 */
export function withQueuedCards(
  plan: PlanView,
  queue: readonly QueuedCardView[],
  reaches: (at: number) => boolean,
): ShownPlan {
  const reached = queue.flatMap(({ poolCardId, name, board }, at) =>
    reaches(at) ? [{ card: { poolCardId, name, queuePlace: at + 1 }, board }] : [],
  );
  const on = (planBoard: PlanBoard): PlanBoardCard[] => [
    ...cardsOn(plan, planBoard),
    ...reached.filter(({ board }) => board === planBoard).map(({ card }) => card),
  ];
  return { ...plan, mainboard: on('Mainboard'), sideboard: on('Sideboard') };
}

/** The pool card `poolCardId` as `plan` shows it, and the plan board it's on; null if it's on neither. */
export function shownOn(
  plan: PlanBoardsOf<PlanBoardCard>,
  poolCardId: string,
): { planBoard: PlanBoard; card: PlanBoardCard } | null {
  for (const planBoard of PLAN_BOARDS) {
    const card = cardsOn(plan, planBoard).find((each) => each.poolCardId === poolCardId);
    if (card) return { planBoard, card };
  }
  return null;
}

/** One line of a plan board: a card's picked copies, a basic land's, or one queued card, with how many the plan board holds. */
export interface PlanLine extends PlanBoardCard {
  /** How many copies the plan board holds. The line's `poolCardId` is its first copy's, which is the one a move or removal acts on. */
  count: number;
  /** Each copy's pool card id, in the order the plan board holds them. */
  poolCardIds: string[];
  /**
   * What the line is tracked by: its kind and its copies' name; a queued
   * card's own pool card id. Unlike `poolCardId`, it stays the same as the
   * first copy moves away, so the line isn't rebuilt under focus.
   */
  key: string;
}

/** What a move acts on: a line's first copy, a stacked card, or a card from its Card detail; a queued card's moves its queued copy. */
export type MovedCard =
  Pick<PlanBoardCard, 'poolCardId' | 'name' | 'basic' | 'queuePlace'> | PlanLine;

/**
 * One line per distinct name, picked and basic copies apart, in the order
 * each first appears, counting its copies; and one per queued card, as each
 * has its own place in the queue.
 */
export function lines(cards: PlanBoardCard[]): PlanLine[] {
  const byName = new Map<string, PlanLine>();
  for (const card of cards) {
    const kind = kindOf(card);
    // Stryker disable next-line StringLiteral: with the prefix emptied, a queued card's key, its pool card id, stays distinct from the others, so lines and focus keys come out the same.
    const key = kind === 'queued' ? `queued ${card.poolCardId}` : `${kind} ${card.name}`;
    const line = byName.get(key);
    if (line) {
      line.count++;
      line.poolCardIds.push(card.poolCardId);
    } else {
      byName.set(key, { ...card, count: 1, poolCardIds: [card.poolCardId], key });
    }
  }
  return [...byName.values()];
}

/** The cards `planBoard` holds: its planned pool cards, then a card per copy of each of its basic lands. */
export function heldOn(plan: PlanBoardsOf<PlanBoardCard>, planBoard: PlanBoard): PlanBoardCard[] {
  return [...cardsOn(plan, planBoard), ...basicsOn(plan.basics, planBoard).flatMap(basicCopies)];
}

/** One card per copy of a basic land on its plan board, each with an id of its own to track and drag it by. */
export function basicCopies({ land, board, count }: PlannedBasicView): PlanBoardCard[] {
  return Array.from({ length: count }, (_, copy) => ({
    poolCardId: basicCopyId(board, land, copy),
    name: land,
    basic: land,
  }));
}

/** The id of a basic land's copy: which plan board holds it, and which copy there it is. */
export const basicCopyId = (planBoard: PlanBoard, land: BasicLand, copy: number) =>
  `basic-${planBoard}-${land}-${copy}`;
