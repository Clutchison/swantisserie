import { type PickView } from './drafts';

/** What an Arena export needs of a picked card. */
export type ArenaExportCard = Pick<PickView, 'name' | 'layout'>;

/** The cards in Arena's import format: a `Deck` header, then `1 Card Name` lines. */
export function arenaExport(cards: ArenaExportCard[]): string {
  return ['Deck', ...cards.map((card) => `1 ${arenaName(card)}`)].join('\n');
}

/**
 * The name Arena knows a card by: split cards by both faces, other multi-face
 * cards by their front face. A card with no layout yet keeps its whole name, as
 * a lone face of a split card is no card at all.
 */
function arenaName({ name, layout }: ArenaExportCard): string {
  return layout === 'split' || layout === null ? name : name.split(' // ')[0];
}
