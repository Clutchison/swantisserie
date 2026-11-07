import { availableCopies, type Pool, type Swap, swapOrLose } from './copies.js';

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
  swapped?: Swap;
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
 * that queue is cleared or kept as the seat's entry in `stealBehaviors`
 * says: clear queue for a seat it omits.
 * `picked` is the cards picked already, with or without this one. Cards are
 * pool card ids.
 */
export function queuesAfterPick(
  pick: SeatPick,
  queues: readonly (readonly string[])[],
  {
    pool,
    picked,
    // Stryker disable next-line ArrayDeclaration: any steal behavior other than PickNext acts the same as none.
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
      const { cards, ...swappedOrLost } = after;
      return { queue: cards, ...swappedOrLost, cleared: [] };
    }
    return { queue: [], lost: after.lost, cleared: after.cards };
  });
}

/** A queued card and its place in the queue: lowest first, not necessarily consecutive. */
export interface QueuedCardAt {
  card: string;
  position: number;
}

/**
 * A player's queue, in order, once an undo puts back the cards its pick took
 * out of it. `queue` is the queue as it is now, and `takenOut` the cards the
 * pick took out, each where it was then, both lowest position first;
 * `restKept` is whether the rest of the queue stayed when the card was lost,
 * as under pick next. A card lost while the rest was kept goes back in its
 * old place among the cards queued now: after those whose positions come
 * before it, so after as many as were ahead of it, unless since reordered. A
 * cleared queue comes back at the front in its original order, ahead of
 * anything queued since. A card both put back and queued again since is
 * held once, in the first of its two places.
 */
export function queueAfterUndo(
  queue: readonly QueuedCardAt[],
  takenOut: readonly QueuedCardAt[],
  { restKept }: { restKept: boolean },
): string[] {
  const at =
    restKept && takenOut.length > 0
      ? queue.filter((queued) => queued.position < takenOut[0].position).length
      : 0;
  return [
    ...new Set(queue.toSpliced(at, 0, ...takenOut).map(({ card }) => card)),
  ];
}
