import type { PickView } from 'contract';
import { countedLines } from './counted-lines';

/** What a Moxfield export needs of a picked card. */
export type MoxfieldExportCard = Pick<PickView, 'name' | 'set' | 'collectorNumber'>;

/**
 * The cards in Moxfield's bulk edit format: `1 Card Name (SET) 123` lines,
 * using each card's snapshotted printing, with copies of a card on one line.
 */
export function moxfieldExport(cards: MoxfieldExportCard[]): string {
  return countedLines(
    cards.map(
      ({ name, set, collectorNumber }) => `${name} (${set.toUpperCase()}) ${collectorNumber}`,
    ),
  ).join('\n');
}
