import { manaSymbol } from './mana-cost';
import type { Letter } from './type-letter';

/** A mana symbol, decorative, with any text after it, as 7+'s "+". */
export interface ManaSymbolLabel {
  kind: 'manaSymbol';
  src: string;
  after: string;
}

/** A type letter, also decorative. */
export interface TypeLetterLabel {
  kind: 'typeLetter';
  letter: Letter;
}

/** Text. */
export interface TextLabel {
  kind: 'text';
  text: string;
}

/** What a stack header shows for its stack. */
export type StackLabel = ManaSymbolLabel | TypeLetterLabel | TextLabel;

const symbolLabel = (src: string, after = ''): ManaSymbolLabel => ({
  kind: 'manaSymbol',
  src,
  after,
});

/** The label showing Scryfall's mana symbol `symbol`, as a cost writes it, e.g. {7}, then `after`. */
export function manaSymbolLabel(symbol: string, after = ''): ManaSymbolLabel {
  const { src } = manaSymbol(symbol);
  if (src === undefined) throw new Error(`The app has no SVG for the mana symbol ${symbol}`);
  return symbolLabel(src, after);
}

/**
 * The label showing the Mana icon set's multicolor symbol, as Scryfall has
 * none. Its SVG records its source and licence.
 */
export const MULTICOLOR_LABEL = symbolLabel('mana-icon-set/multicolor.svg');

/** The label showing the type letter `letter`. */
export const typeLetterLabel = (letter: Letter): TypeLetterLabel => ({
  kind: 'typeLetter',
  letter,
});

/** The label showing `text`. */
export const textLabel = (text: string): TextLabel => ({ kind: 'text', text });

/** The lands' label under every grouping: Land's type letter. */
export const LANDS_LABEL = typeLetterLabel('L');
