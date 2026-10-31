import { type PoolSearchCard, searchPool } from './pool-search';

/** What a color filter button stands for: a color, or C for colorless. */
export type ColorChoice = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/** What a viewer has set across the pool filters. */
export interface PoolFilterState {
  colors: ReadonlySet<ColorChoice>;
}

export const noPoolFilters: PoolFilterState = { colors: new Set() };

/** The colors in Scryfall's order, so the search text doesn't depend on which was pressed first. */
const COLORS: ColorChoice[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * The color filter's search text. A card is colorless only if no face has a
 * color: a white spell with a land on its back is a white card, so it shows for
 * White, but not for Colorless. `c:c` and `-c:c` won't do, since either looks
 * for any colorless face. Search terms can each match a different face, so a
 * WB // colorless card would show for White alone; no such card is known.
 */
export function colorFilterSearch(pressed: ReadonlySet<ColorChoice>): string {
  const letters = COLORS.filter((color) => pressed.has(color)).map((color) => color.toLowerCase());
  const colorless = pressed.has('C') ? ['-c>=1'] : [];
  if (!letters.length) return colorless.join('');
  const options = [...letters.map((letter) => `c:${letter}`), ...colorless];
  return `(${options.join(' or ')}) c<=${letters.join('')}`;
}

/** Each pool filter, as Scryfall search text for its state: empty when it narrows nothing. */
const POOL_FILTERS: ((state: PoolFilterState) => string)[] = [
  ({ colors }) => colorFilterSearch(colors),
];

/** Whether any pool filter is narrowing the cards. */
export function poolFilterActive(state: PoolFilterState): boolean {
  return POOL_FILTERS.some((filter) => filter(state) !== '');
}

/** The cards every pool filter lets through, in their original order. */
export function applyPoolFilters<C extends PoolSearchCard>(
  cards: C[],
  state: PoolFilterState,
): C[] {
  return POOL_FILTERS.reduce((remaining, filter) => {
    const result = searchPool(remaining, filter(state));
    if (!result.ok) throw new Error(`Bad pool filter search: ${result.error.message}`);
    return result.cards;
  }, cards);
}
