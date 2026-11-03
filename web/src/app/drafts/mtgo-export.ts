import type { PickView } from 'contract';
import { countedLines } from './counted-lines';

/** What an MTGO export needs of a picked card. */
export type MtgoExportCard = Pick<PickView, 'name' | 'layout' | 'typeLine'>;

/** Between the faces of a multi-face card's name, as Scryfall writes it. */
const FACES = ' // ';

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
 * go by their front face, and meld cards are one face already. A card with no
 * layout yet keeps its whole name, as a lone face of a split card is no card at
 * all.
 */
function mtgoName({ name, layout, typeLine }: MtgoExportCard): string {
  if (layout === null || layout === 'meld') return name;
  if (layout === 'split') return isRoom(typeLine) ? name : name.replaceAll(FACES, '/');
  return name.split(FACES)[0];
}

function isRoom(typeLine: string): boolean {
  return /\bRoom\b/.test(typeLine);
}
