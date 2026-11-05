/**
 * A draft's pool: each pool card's oracle id, keyed by pool card id. Copies
 * of a card share an oracle id. Copies are offered in this order.
 */
export type Pool = ReadonlyMap<string, string>;

/**
 * What a lost card does to the rest of a player's queue: under clear queue
 * the rest is cleared; under pick next it stays, in order.
 */
export type StealBehavior = 'ClearQueue' | 'PickNext';

/** A pick: the seat that made it and the pool card it picked. */
export interface SeatPick {
  /** 0-based index into the seat order. */
  seat: number;
  card: string;
}

/** One seat's queue after a pick. */
export interface QueueAfterPick {
  /** The queued cards, in order. */
  queue: string[];
  /** The copy swapped in for the picked card, if one was. */
  swapped?: string;
  /** The picked card, if this queue lost it: no copy was available for it. */
  lost?: string;
  /**
   * The cards cleared from this queue because it lost the picked card under
   * clear queue, in queue order. Empty otherwise.
   */
  cleared: string[];
}

/**
 * What a pick does to queues, which are each seat's queued cards in order,
 * indexed by seat. The picked card leaves the picker's queue. In each other
 * queue holding it, it is swapped, in the same place, for the first copy in
 * `pool` that is not `picked` and that the queue doesn't hold; with no such
 * copy, it is lost, and the rest of that queue is cleared or kept as the
 * seat's entry in `stealBehaviors` says: clear queue for a seat it omits.
 * `picked` is the cards picked already, with or without this one. Cards are
 * pool card ids.
 */
export function queuesAfterPick(
  pick: SeatPick,
  queues: readonly (readonly string[])[],
  {
    pool,
    picked,
    stealBehaviors = [],
  }: {
    pool: Pool;
    picked: readonly string[];
    stealBehaviors?: readonly StealBehavior[];
  },
): QueueAfterPick[] {
  const copies = availableCopies(pick.card, pool, picked);
  return queues.map((queue, seat) => {
    if (seat === pick.seat) {
      return {
        queue: queue.filter((queued) => queued !== pick.card),
        cleared: [],
      };
    }
    const at = queue.indexOf(pick.card);
    if (at === -1) return { queue: [...queue], cleared: [] };
    const copy = copies.find((card) => !queue.includes(card));
    if (copy === undefined) {
      return stealBehaviors[seat] === 'PickNext'
        ? { queue: queue.toSpliced(at, 1), lost: pick.card, cleared: [] }
        : { queue: [], lost: pick.card, cleared: queue.toSpliced(at, 1) };
    }
    return { queue: queue.with(at, copy), swapped: copy, cleared: [] };
  });
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
