import { manaSymbol } from './mana-cost';

/**
 * What a stack header shows for its stack: a mana symbol, decorative, with
 * any text after it, as 7+'s "+", or text.
 */
export type StackLabel =
  { kind: 'symbol'; src: string; after: string } | { kind: 'text'; text: string };

/** The label showing Scryfall's mana symbol `symbol`, as a cost writes it, e.g. {7}, then `after`. */
export function manaSymbolLabel(symbol: string, after = ''): StackLabel {
  const { src } = manaSymbol(symbol);
  if (src === undefined) throw new Error(`The app has no SVG for the mana symbol ${symbol}`);
  return { kind: 'symbol', src, after };
}

/**
 * The label showing the Mana icon set's multicolor symbol, as Scryfall has
 * none. Its SVG records its source and licence.
 */
export const MULTICOLOR_LABEL: StackLabel = {
  kind: 'symbol',
  src: 'mana-icon-set/multicolor.svg',
  after: '',
};

/** The label showing `text`. */
export const textLabel = (text: string): StackLabel => ({ kind: 'text', text });
