import type { PlanBoard } from 'contract';
import { countedLines } from './counted-lines';
import { basicsOn, cardsOn, type PlanBoardsOf } from './plan-boards';

/**
 * What an export is made of: a player's plan without its unpicked cards,
 * as each plan board's picked cards (one entry per copy), and the basics of
 * both plan boards, each on its own.
 */
export type ExportPlan<Card> = PlanBoardsOf<Card>;

/** The most sideboard cards Arena's import may keep. */
export const ARENA_SIDEBOARD_CAP = 15;

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
