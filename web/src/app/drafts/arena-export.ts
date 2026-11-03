import type { PickView } from 'contract';
import { frontFace } from './card-faces';
import { countedLines } from './counted-lines';

/** What an Arena export needs of a picked card. */
export type ArenaExportCard = Pick<PickView, 'name' | 'layout'>;

/**
 * The cards in Arena's import format: a `Deck` header, then `1 Card Name`
 * lines, with copies of a card on one line, as `2 Card Name`.
 */
export function arenaExport(cards: ArenaExportCard[]): string {
  return ['Deck', ...countedLines(cards.map(arenaName))].join('\n');
}

/**
 * The name Arena knows a card by: split cards by both faces, other multi-face
 * cards by their front face.
 */
function arenaName({ name, layout }: ArenaExportCard): string {
  return layout === 'split' ? name : frontFace(name);
}
