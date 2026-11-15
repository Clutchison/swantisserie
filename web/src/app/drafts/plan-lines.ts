import type { BasicLand, PlanBoard, PlannedBasicView, PlannedCardView, PlanView } from 'contract';
import { basicsOn, cardsOn } from './plan-boards';

/**
 * A card on a plan board as the Deck tab shows it: a planned pool card, or
 * a copy of a basic land, which counts as picked. A basic's `poolCardId` is
 * no pool card's, but keys its card data in the tab's `cardsById`.
 */
export interface PlanBoardCard extends PlannedCardView {
  basic?: BasicLand;
}

/** One line of a plan board: a card's picked copies, its unpicked ones, or a basic land's, with how many the plan board holds. */
export interface PlanLine extends PlanBoardCard {
  /** How many copies the plan board holds. The line's `poolCardId` is its first copy's, which is the one a move or removal acts on. */
  count: number;
  /** Each copy's pool card id, in the order the plan board holds them. */
  poolCardIds: string[];
  /**
   * What the line is tracked by: whether its copies are picked, unpicked or
   * a basic land's, and their name. Unlike `poolCardId`, it stays the same
   * as the first copy moves away, so the line isn't rebuilt under focus.
   */
  key: string;
}

/** What a move acts on: a line's first copy, a stacked card, or a card from its Card detail. */
export type MovedCard = Pick<PlanBoardCard, 'poolCardId' | 'name' | 'basic'> | PlanLine;

/**
 * One line per distinct name, picked, unpicked and basic copies apart, in
 * the order each first appears, counting its copies.
 */
export function lines(cards: PlanBoardCard[]): PlanLine[] {
  const byName = new Map<string, PlanLine>();
  for (const card of cards) {
    // Stryker disable next-line StringLiteral: with any one kind emptied the three stay distinct, so lines and focus keys come out the same.
    const kind = card.basic ? 'basic' : card.picked ? 'picked' : 'unpicked';
    const key = `${kind} ${card.name}`;
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
export function heldOn(plan: PlanView, planBoard: PlanBoard): PlanBoardCard[] {
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
