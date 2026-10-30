import { type PickView } from './drafts';

/** What a Moxfield export needs of a picked card. */
export type MoxfieldExportCard = Pick<PickView, 'name' | 'set' | 'collectorNumber'>;

/** The cards in Moxfield's bulk edit format: `1 Card Name (SET) 123` lines, using each card's snapshotted printing. */
export function moxfieldExport(cards: MoxfieldExportCard[]): string {
  return cards
    .map(({ name, set, collectorNumber }) => `1 ${name} (${set.toUpperCase()}) ${collectorNumber}`)
    .join('\n');
}
