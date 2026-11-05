import type { PickView } from 'contract';
import { frontFace } from 'engine';
import { planBoardLines, type ExportPlan } from './export-plan';

/** What an Arena export needs of a picked card. */
export type ArenaExportCard = Pick<PickView, 'name' | 'layout'>;

/**
 * The plan in Arena's import format: a `Deck` header, then the mainboard's
 * `1 Card Name` lines, with copies of a card on one line, as `2 Card Name`,
 * and its basics. A sideboard follows after a blank line, under a
 * `Sideboard` header, unless it's empty.
 */
export function arenaExport({ mainboard, sideboard, basics }: ExportPlan<ArenaExportCard>): string {
  const lines = ['Deck', ...planBoardLines(mainboard.map(arenaName), basics)];
  if (sideboard.length > 0)
    lines.push('', 'Sideboard', ...planBoardLines(sideboard.map(arenaName)));
  return lines.join('\n');
}

/**
 * The name Arena knows a card by: split cards by both faces, other multi-face
 * cards by their front face.
 */
function arenaName({ name, layout }: ArenaExportCard): string {
  return layout === 'split' ? name : frontFace(name);
}
