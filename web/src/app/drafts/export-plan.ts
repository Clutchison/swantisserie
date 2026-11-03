import type { PlannedBasicView } from 'contract';
import { countedLines } from './counted-lines';

/**
 * What an export is made of: a player's plan without its unpicked cards,
 * as each plan board's picked cards (one entry per copy) and the mainboard's basics.
 */
export interface ExportPlan<Card> {
  mainboard: Card[];
  sideboard: Card[];
  basics: PlannedBasicView[];
}

/**
 * A plan board's `<count> <line>` lines: its cards', with copies sharing a line in
 * the order each first appears, then its basics', in the plan's order.
 */
export function planBoardLines(cards: string[], basics: PlannedBasicView[] = []): string[] {
  return [...countedLines(cards), ...basics.map(({ land, count }) => `${count} ${land}`)];
}
