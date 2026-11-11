import type { PoolCardView } from 'contract';
import { planBoardLines, type ExportPlan } from './export-plan';

/** What a Moxfield export needs of a picked card. */
export type MoxfieldExportCard = Pick<PoolCardView, 'name' | 'set' | 'collectorNumber'>;

/**
 * The plan in Moxfield's bulk edit format: the mainboard's
 * `1 Card Name (SET) 123` lines, using each card's snapshotted printing, with
 * copies of a card on one line, then its basics with no printing. A sideboard
 * follows after a blank line, under a `SIDEBOARD:` header, with its basics,
 * unless it's empty: the shape of Moxfield's own export (see
 * `docs/research/moxfield.md`).
 */
export function moxfieldExport(plan: ExportPlan<MoxfieldExportCard>): string {
  const lines = planBoardLines(plan, 'Mainboard', moxfieldName);
  const sideboard = planBoardLines(plan, 'Sideboard', moxfieldName);
  if (sideboard.length > 0) lines.push('', 'SIDEBOARD:', ...sideboard);
  return lines.join('\n');
}

/** A card with its printing, as `Card Name (SET) 123`. */
function moxfieldName({ name, set, collectorNumber }: MoxfieldExportCard): string {
  return `${name} (${set.toUpperCase()}) ${collectorNumber}`;
}
