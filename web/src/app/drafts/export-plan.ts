import type { PlanBoard, PlannedBasicView } from 'contract';
import { countedLines } from './counted-lines';
import { basicsOn } from './plan-basics';

/**
 * What an export is made of: a player's plan without its unpicked cards,
 * as each plan board's picked cards (one entry per copy), and the basics of
 * both plan boards, each on its own.
 */
export interface ExportPlan<Card> {
  mainboard: Card[];
  sideboard: Card[];
  basics: PlannedBasicView[];
}

/**
 * A plan board's `<count> <line>` lines: its cards', named by `name`, with
 * copies sharing a line in the order each first appears, then its basics', in
 * the plan's order.
 */
export function planBoardLines<Card>(
  plan: ExportPlan<Card>,
  planBoard: PlanBoard,
  name: (card: Card) => string,
): string[] {
  return [
    ...countedLines(cardsOn(plan, planBoard).map(name)),
    ...basicsOn(plan.basics, planBoard).map(({ land, count }) => `${count} ${land}`),
  ];
}

/** How many cards a plan board holds, its basics included. */
export function planBoardCount<Card>(plan: ExportPlan<Card>, planBoard: PlanBoard): number {
  return basicsOn(plan.basics, planBoard).reduce(
    (total, { count }) => total + count,
    cardsOn(plan, planBoard).length,
  );
}

/** The cards a plan board holds, its basics left out. */
export function cardsOn<Card>(plan: ExportPlan<Card>, planBoard: PlanBoard): Card[] {
  return planBoard === 'Mainboard' ? plan.mainboard : plan.sideboard;
}
