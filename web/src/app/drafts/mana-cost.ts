import type { CardFace, PoolCardView } from 'contract';
import { MANA_SYMBOLS } from './mana-symbols';

/** One symbol of a mana cost, with Scryfall's SVG and description of it if the app has them. */
export interface ManaSymbol {
  /** As the cost writes it, e.g. {2/W}. */
  text: string;
  src?: string;
  description?: string;
}

/** The mana cost a card's name shows, as symbols. */
export function manaCostOf(card: {
  manaCost: PoolCardView['manaCost'];
  faces: Pick<CardFace, 'manaCost'>[];
}): ManaSymbol[] {
  // A double-faced card's cost is its faces', of which the name shows the front's.
  const cost = card.manaCost ?? card.faces[0]?.manaCost ?? '';
  // A split card's or Room's writes both halves', between them //.
  return [...cost.matchAll(/\{[^}]*\}|\/\//g)].map(([text]) => {
    const known = MANA_SYMBOLS[text];
    return known ? { text, src: `mana/${known.file}`, description: known.description } : { text };
  });
}
