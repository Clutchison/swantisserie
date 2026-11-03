import type { PickView } from 'contract';
import { FACE_SEPARATOR, frontFace } from './card-faces';
import { countedLines } from './counted-lines';

/** What an MTGO export needs of a picked card. */
export type MtgoExportCard = Pick<PickView, 'name' | 'layout' | 'typeLine'>;

/**
 * The cards in MTGO's deck import format: `1 Card Name` lines with no header,
 * with copies of a card on one line, as `2 Card Name`.
 */
export function mtgoExport(cards: MtgoExportCard[]): string {
  return countedLines(cards.map(mtgoName)).join('\n');
}

/**
 * The name MTGO knows a card by: split cards by both faces joined by a slash,
 * as `Fire/Ice`, though Rooms keep Scryfall's `A // B`. Other multi-face cards
 * go by their front face, and meld cards are one face already.
 */
function mtgoName({ name, layout, typeLine }: MtgoExportCard): string {
  if (layout === 'split') return isRoom(typeLine) ? name : name.replaceAll(FACE_SEPARATOR, '/');
  return frontFace(name);
}

function isRoom(typeLine: string): boolean {
  return /\bRoom\b/.test(typeLine);
}
