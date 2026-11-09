import { MANA_SYMBOLS } from './mana-symbols';
import type { Grouping } from './plan-stacks';

/**
 * What a stack header shows for its stack: a mana symbol, decorative, with
 * any text after it, as 7+'s "+", or text.
 */
export type StackLabel =
  { kind: 'symbol'; src: string; after: string } | { kind: 'text'; text: string };

const scryfall = (symbol: string, after = ''): StackLabel => ({
  kind: 'symbol',
  src: `mana/${MANA_SYMBOLS[symbol].file}`,
  after,
});

/**
 * Each grouping's stack labels, by stack name, so the row reads like a mana
 * cost. A stack missing here, as Lands, shows its name.
 */
const SYMBOLS: Partial<Record<Grouping, Readonly<Record<string, StackLabel>>>> = {
  manaValue: {
    ...Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((value) => [String(value), scryfall(`{${value}}`)]),
    ),
    '7+': scryfall('{7}', '+'),
  },
  color: {
    ...Object.fromEntries(
      ['W', 'U', 'B', 'R', 'G'].map((color) => [color, scryfall(`{${color}}`)]),
    ),
    // Scryfall has no multicolor symbol: this one is the Mana icon set's, whose source and
    // licence its SVG records.
    Multicolor: { kind: 'symbol', src: 'mana-icon-set/multicolor.svg', after: '' },
    Colorless: scryfall('{C}'),
  },
};

/** The label of the stack named `stack` under `grouping`. */
export const stackLabel = (grouping: Grouping, stack: string): StackLabel =>
  SYMBOLS[grouping]?.[stack] ?? { kind: 'text', text: stack };
