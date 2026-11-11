import type { PlanBoard, PlannedBasicView } from 'contract';
import { countedLines } from './counted-lines';

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
  const cards = planBoard === 'Mainboard' ? plan.mainboard : plan.sideboard;
  return [
    ...countedLines(cards.map(name)),
    ...plan.basics
      .filter(({ board }) => board === planBoard)
      .map(({ land, count }) => `${count} ${land}`),
  ];
}
