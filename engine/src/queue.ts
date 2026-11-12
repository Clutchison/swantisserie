import { availableCopies, type Pool, type Swap, swapOrLose } from './copies.js';

/**
 * What a lost card does to a player's queue, whose rest stays in order
 * either way: under pause queue the queue is queue paused; under pick next
 * it keeps picking.
 */
export type StealBehavior = 'PauseQueue' | 'PickNext';

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
   * Whether this pick paused the queue: it lost a card while queue picking,
   * under pause queue.
   */
  paused: boolean;
}

/**
 * What a pick does to queues, which are each seat's queued cards in order,
 * indexed by seat. The picked card leaves the picker's queue. In each other
 * queue holding it, it is swapped for a copy or lost, as `swapOrLose` says,
 * with the copies in `pool` that are not `picked`; either way the rest of
 * the queue stays in order. A loss pauses a queue that `queuesPaused` says
 * is queue picking, unless the seat's entry in `stealBehaviors` is pick
 * next: pause queue for a seat it omits, and queue picking for a seat
 * `queuesPaused` omits.
 * `picked` is the cards picked already, with or without this one. Cards are
 * pool card ids.
 */
export function queuesAfterPick(
  pick: SeatPick,
  queues: readonly (readonly string[])[],
  {
    pool,
    picked,
    // Stryker disable next-line ArrayDeclaration: any steal behavior other than `PickNext` acts the same as none.
    stealBehaviors = [],
    // Stryker disable next-line ArrayDeclaration: any entry other than `true` acts the same as none.
    queuesPaused = [],
  }: {
    pool: Pool;
    picked: readonly string[];
    stealBehaviors?: readonly StealBehavior[];
    queuesPaused?: readonly boolean[];
  },
): QueueAfterPick[] {
  const copies = availableCopies(pick.card, pool, picked);
  return queues.map((queue, seat) => {
    if (seat === pick.seat) {
      return {
        queue: queue.filter((queued) => queued !== pick.card),
        paused: false,
      };
    }
    const { cards, ...swappedOrLost } = swapOrLose(queue, pick.card, copies);
    return {
      queue: cards,
      ...swappedOrLost,
      paused:
        swappedOrLost.lost !== undefined &&
        stealBehaviors[seat] !== 'PickNext' &&
        queuesPaused[seat] !== true,
    };
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
 * `restKept` is whether the rest of the queue stayed when the card was lost:
 * false only for a queue cleared under clear queue, which picks no longer
 * do, but an undo of a pick made before then still puts back. A card lost while the rest was kept goes back in its
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
