import type { CardFace, PoolCardView } from 'contract';
import { FACE_SEPARATOR } from './card-faces';
import { MANA_SYMBOLS } from './mana-symbols';

/** One symbol of a mana cost, with Scryfall's SVG and description of it if the app has them. */
export interface ManaSymbol {
  /** As the cost writes it, e.g. {2/W}. */
  text: string;
  src?: string;
  description?: string;
}

/** The mana cost a card's name shows, as symbols: only ever one face's. */
export function manaCostOf(card: {
  manaCost: PoolCardView['manaCost'];
  faces: Pick<CardFace, 'manaCost'>[];
}): ManaSymbol[] {
  // A card with several costs shows only its first face's. A double-faced card's
  // front face holds its cost; a split card, Room or adventure writes both
  // halves' costs in one, between them //, and shows the first.
  const cost = (card.manaCost ?? card.faces[0]?.manaCost ?? '').split(FACE_SEPARATOR)[0];
  return [...cost.matchAll(/\{[^}]*\}/g)].map(([text]) => {
    const svg = MANA_SYMBOLS[text];
    return svg ? { text, src: `mana/${svg.file}`, description: svg.description } : { text };
  });
}
