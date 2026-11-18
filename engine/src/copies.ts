import type { QueuedCopy } from './queue.js';

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

/**
 * The queued copy in a seat's own queue that its pick of `card` accounts
 * for: `card` itself if the queue holds it, otherwise the first of the
 * queue's copies that is one of `copies`, otherwise none. `copies` is the
 * card's available copies, as `availableCopies` offers them.
 */
export function ownPickCopy(
  queue: readonly QueuedCopy[],
  card: string,
  copies: readonly string[],
): QueuedCopy | undefined {
  return (
    queue.find((queued) => queued.card === card) ??
    queue.find((queued) => copies.includes(queued.card))
  );
}

/** A queue after another player picks a card it holds. */
export interface SwappedOrLost {
  /** The queued copies, in order. */
  queue: QueuedCopy[];
  /** The picked card and the copy swapped in for it, in the same place. */
  swapped?: Swap;
  /** The picked card, if the queue lost it: no copy was available for it. */
  lost?: string;
}

/**
 * What another player's pick of `card` does to a queue holding it: the
 * card is swapped, in the same place and on the same plan board, for the
 * first of `copies` the queue doesn't hold; with no such copy, it is lost
 * and leaves the queue. A queue that doesn't hold the card comes back as it
 * is. `copies` is the card's available copies, as `availableCopies` offers
 * them.
 */
export function swapOrLose(
  queue: readonly QueuedCopy[],
  card: string,
  copies: readonly string[],
): SwappedOrLost {
  const at = queue.findIndex((queued) => queued.card === card);
  if (at === -1) return { queue: [...queue] };
  const copy = copies.find(
    (copy) => !queue.some((queued) => queued.card === copy),
  );
  return copy === undefined
    ? { queue: queue.toSpliced(at, 1), lost: card }
    : {
        queue: queue.with(at, { ...queue[at], card: copy }),
        swapped: { out: card, in: copy },
      };
}
