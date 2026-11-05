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
  /** The picked card and the copy swapped in for it, if one was. */
  swapped?: { out: string; in: string };
  /** The picked card, if this queue lost it: no copy was available for the queue. */
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
 * queue holding it, it is swapped for a copy or lost, as `swapOrLose` says,
 * with the copies in `pool` that are not `picked`; once lost, the rest of
 * that queue is cleared or kept as the
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
    const after = swapOrLose(queue, pick.card, copies);
    if (after.lost === undefined || stealBehaviors[seat] === 'PickNext') {
      const { list, ...swappedOrLost } = after;
      return { queue: list, ...swappedOrLost, cleared: [] };
    }
    return { queue: [], lost: after.lost, cleared: after.list };
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

/** A list of cards, queued or planned, after another player picks one it holds. */
export interface SwappedOrLost {
  /** The list's cards, in order. */
  list: string[];
  /** The picked card and the copy swapped in for it, in the same place. */
  swapped?: { out: string; in: string };
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
  if (at === -1) return { list: [...list] };
  const copy = copies.find((copy) => !list.includes(copy));
  return copy === undefined
    ? { list: list.toSpliced(at, 1), lost: card }
    : { list: list.with(at, copy), swapped: { out: card, in: copy } };
}
