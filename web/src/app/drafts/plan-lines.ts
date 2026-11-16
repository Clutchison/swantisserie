import type {
  BasicLand,
  PlanBoard,
  PlannedBasicView,
  PlannedCardView,
  PlanView,
  QueuedCardView,
} from 'contract';
import { basicsOn, cardsOn, type PlanBoardsOf } from './plan-boards';

/**
 * A card on a plan board as the Deck tab shows it: a planned pool card, a
 * copy of a basic land, which counts as picked, or a queued card, which
 * isn't. A basic's `poolCardId` is no pool card's, but keys its card data in
 * the tab's `cardsById`.
 */
export interface PlanBoardCard extends PlannedCardView {
  basic?: BasicLand;
  /** A queued card's 1-based place in the player's queue, which its Queued badge shows. */
  queued?: number;
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
 * The deck `plan` shows with `reached`, the queued cards before the Queue
 * cutoff, in queue order: each plan board's planned cards, then the queued
 * cards on it, each with its place in the queue. A queued copy the plan
 * also holds as an unpicked card shows once, as the queued card on its own
 * plan board.
 */
export function withQueuedCards(plan: PlanView, reached: readonly QueuedCardView[]): ShownPlan {
  const queuedIds = new Set(reached.map((card) => card.poolCardId));
  const on = (planBoard: PlanBoard): PlanBoardCard[] => [
    ...cardsOn(plan, planBoard).filter((card) => card.picked || !queuedIds.has(card.poolCardId)),
    ...reached.flatMap(({ poolCardId, name, board }, at) =>
      board === planBoard ? [{ poolCardId, name, picked: false, queued: at + 1 }] : [],
    ),
  ];
  return { ...plan, mainboard: on('Mainboard'), sideboard: on('Sideboard') };
}

/** One line of a plan board: a card's picked copies, its unpicked ones, a basic land's, or one queued card, with how many the plan board holds. */
export interface PlanLine extends PlanBoardCard {
  /** How many copies the plan board holds. The line's `poolCardId` is its first copy's, which is the one a move or removal acts on. */
  count: number;
  /** Each copy's pool card id, in the order the plan board holds them. */
  poolCardIds: string[];
  /**
   * What the line is tracked by: whether its copies are picked, unpicked or
   * a basic land's, and their name; a queued card's own pool card id. Unlike `poolCardId`, it stays the same
   * as the first copy moves away, so the line isn't rebuilt under focus.
   */
  key: string;
}

/** What a move acts on: a line's first copy, a stacked card, or a card from its Card detail; a queued card's moves its queued copy. */
export type MovedCard = Pick<PlanBoardCard, 'poolCardId' | 'name' | 'basic' | 'queued'> | PlanLine;

/**
 * One line per distinct name, picked, unpicked and basic copies apart, in
 * the order each first appears, counting its copies; and one per queued
 * card, as each has its own place in the queue.
 */
export function lines(cards: PlanBoardCard[]): PlanLine[] {
  const byName = new Map<string, PlanLine>();
  for (const card of cards) {
    // Stryker disable next-line StringLiteral: with any one kind emptied the three stay distinct, so lines and focus keys come out the same.
    const kind = card.basic ? 'basic' : card.picked ? 'picked' : 'unpicked';
    const key = card.queued ? `queued ${card.poolCardId}` : `${kind} ${card.name}`;
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
    picked: true,
    basic: land,
  }));
}

/** The id of a basic land's copy: which plan board holds it, and which copy there it is. */
export const basicCopyId = (planBoard: PlanBoard, land: BasicLand, copy: number) =>
  `basic-${planBoard}-${land}-${copy}`;
