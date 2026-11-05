/**
 * A draft's pool: each pool card's oracle id, keyed by pool card id. Copies
 * of a card share an oracle id. Copies are offered in this order.
 */
export type Pool = ReadonlyMap<string, string>;

/** A card swapped, in the same place, for a copy of it. */
export interface Swap {
  out: string;
  in: string;
}

/**
 * The copies of `card` still available once it is picked: the cards in
 * `pool` sharing its oracle id, in `pool` order, leaving out `picked` and
 * the card itself.
 */
export function availableCopies(
  card: string,
  pool: Pool,
  picked: readonly string[],
): string[] {
  const taken = new Set([...picked, card]);
  const oracleId = pool.get(card);
  return [...pool]
    .filter(
      ([copy, copyOracleId]) => copyOracleId === oracleId && !taken.has(copy),
    )
    .map(([copy]) => copy);
}

/** A list of cards, queued or planned, after another player picks one it holds. */
export interface SwappedOrLost {
  /** The list's cards, in order. */
  cards: string[];
  /** The picked card and the copy swapped in for it, in the same place. */
  swapped?: Swap;
  /** The picked card, if the list lost it: no copy was available for it. */
  lost?: string;
}

/**
 * What another player's pick of `card` does to a list holding it: the card
 * is swapped, in the same place, for the first of `copies` the list doesn't
 * hold; with no such copy, it is lost and leaves the list. A list that
 * doesn't hold the card comes back as it is. `copies` is the card's
 * available copies, as `availableCopies` offers them.
 */
export function swapOrLose(
  list: readonly string[],
  card: string,
  copies: readonly string[],
): SwappedOrLost {
  const at = list.indexOf(card);
  if (at === -1) return { cards: [...list] };
  const copy = copies.find((copy) => !list.includes(copy));
  return copy === undefined
    ? { cards: list.toSpliced(at, 1), lost: card }
    : { cards: list.with(at, copy), swapped: { out: card, in: copy } };
}
