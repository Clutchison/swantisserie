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

/** An entry in a list of cards, such as a queued copy. */
export interface Listed {
  card: string;
}

/**
 * The entry in a seat's own queue that its pick of `card` accounts for:
 * `card` itself if the queue holds it, otherwise the first of the queue's
 * cards that is one of `copies`, otherwise none. `copies` is the card's
 * available copies, as `availableCopies` offers them.
 */
export function ownPickCopy<T extends Listed>(
  list: readonly T[],
  card: string,
  copies: readonly string[],
): T | undefined {
  return (
    list.find((listed) => listed.card === card) ??
    list.find((listed) => copies.includes(listed.card))
  );
}

/** A list of cards, such as a queue, after another player picks one it holds. */
export interface SwappedOrLost<T extends Listed> {
  /** The list's entries, in order. */
  list: T[];
  /** The picked card and the copy swapped in for it, in the same place. */
  swapped?: Swap;
  /** The picked card, if the list lost it: no copy was available for it. */
  lost?: string;
}

/**
 * What another player's pick of `card` does to a list holding it: the card
 * is swapped, in the same place and keeping the rest of its entry, for the
 * first of `copies` the list doesn't hold; with no such copy, it is lost
 * and leaves the list. A list that doesn't hold the card comes back as it
 * is. `copies` is the card's available copies, as `availableCopies` offers
 * them.
 */
export function swapOrLose<T extends Listed>(
  list: readonly T[],
  card: string,
  copies: readonly string[],
): SwappedOrLost<T> {
  const at = list.findIndex((listed) => listed.card === card);
  if (at === -1) return { list: [...list] };
  const copy = copies.find(
    (copy) => !list.some((listed) => listed.card === copy),
  );
  return copy === undefined
    ? { list: list.toSpliced(at, 1), lost: card }
    : {
        list: list.with(at, { ...list[at], card: copy }),
        swapped: { out: card, in: copy },
      };
}
