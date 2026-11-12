import { availableCopies, type Pool, type Swap, swapOrLose } from './copies.js';
import type { DraftPicks } from './pick.js';
import { currentTurn } from './turn.js';

/**
 * What a lost card does to a player's queue, whose rest stays in order
 * either way: under pause queue the queue is set to queue paused; under
 * pick next it stays queue picking.
 */
export type StealBehavior = 'PauseQueue' | 'PickNext';

/** A pick: the seat that made it and the pool card it picked. */
export interface SeatPick {
  /** 0-based index into the seat order. */
  seat: number;
  card: string;
}

/**
 * What losing a card did to its queue: set it queue paused, under pause
 * queue; or left it as it was, so it stayed queue picking, under pick next,
 * or stayed queue paused.
 */
export type QueueLoss =
  'QueuePaused' | 'StayedQueuePicking' | 'StayedQueuePaused';

/** A card a queue lost, and what losing it did to the queue. */
export interface LostQueuedCard {
  card: string;
  queueLoss: QueueLoss;
}

/**
 * A seat's queue state: its queued cards, in order, its steal behavior, and
 * whether it is queue paused. Cards are pool card ids unless `Card` says
 * otherwise.
 */
export interface SeatQueue<Card = string> {
  /** The queued cards, in order. */
  queue: readonly Card[];
  /** What a card lost from the queue does to it. */
  stealBehavior: StealBehavior;
  /** Whether the queue is queue paused, making no queued picks. */
  queuePaused: boolean;
}

/** One seat's queue state after a pick, and what the pick did to it. */
export interface QueueAfterPick extends SeatQueue {
  /** The picked card and the copy swapped in for it, if one was. */
  swapped?: Swap;
  /** The picked card, if this queue lost it: no copy was available for the queue. */
  lost?: LostQueuedCard;
}

/**
 * What a pick does to `queues`, each seat's queue state, indexed by seat.
 * The picked card leaves the picker's queue. In each other queue holding
 * it, it is swapped for a copy or lost, as `swapOrLose` says, with the
 * copies in `pool` that are not `picked`; either way the rest of the queue
 * stays in order. A loss sets a queue picking queue paused, unless its
 * steal behavior is pick next. Nothing else changes a queue's state.
 * `picked` is the cards picked already, with or without this one. Cards
 * are pool card ids.
 */
export function queuesAfterPick(
  pick: SeatPick,
  queues: readonly SeatQueue[],
  { pool, picked }: { pool: Pool; picked: readonly string[] },
): QueueAfterPick[] {
  const copies = availableCopies(pick.card, pool, picked);
  return queues.map(({ queue, stealBehavior, queuePaused }, seat) => {
    if (seat === pick.seat) {
      return {
        queue: queue.filter((queued) => queued !== pick.card),
        stealBehavior,
        queuePaused,
      };
    }
    const { cards, swapped, lost } = swapOrLose(queue, pick.card, copies);
    if (lost === undefined) {
      return {
        queue: cards,
        stealBehavior,
        queuePaused,
        ...(swapped && { swapped }),
      };
    }
    const queueLoss: QueueLoss = queuePaused
      ? 'StayedQueuePaused'
      : stealBehavior === 'PickNext'
        ? 'StayedQueuePicking'
        : 'QueuePaused';
    return {
      queue: cards,
      stealBehavior,
      queuePaused: queueLoss !== 'StayedQueuePicking',
      lost: { card: lost, queueLoss },
    };
  });
}

/** A pick a queue makes, and what it does to every queue. */
export interface QueuedPickEffects {
  pick: SeatPick;
  /** Each seat's queue state after the pick, as `queuesAfterPick` says. */
  queues: QueueAfterPick[];
}

/**
 * The pick that the queue of the seat whose turn it is makes at `draft`'s
 * current turn, and what it does to every queue: its first queued card not
 * yet picked. None once every pick is made, or if that seat's queue is
 * queue paused or holds no such card. `queues` are each seat's queue state,
 * indexed by seat. Cards are pool card ids, as in `pool` and `draft.picked`.
 */
export function nextQueuedPick(
  draft: DraftPicks,
  queues: readonly SeatQueue[],
  pool: Pool,
): QueuedPickEffects | undefined {
  const turn = currentTurn(draft, draft.picked.length);
  if (!turn) return undefined;
  const { queue, queuePaused } = queues[turn.seat];
  if (queuePaused) return undefined;
  const card = queue.find((queued) => !draft.picked.includes(queued));
  if (card === undefined) return undefined;
  const pick = { seat: turn.seat, card };
  return {
    pick,
    queues: queuesAfterPick(pick, queues, { pool, picked: draft.picked }),
  };
}

/** A queued card and its place in the queue: lowest first, not necessarily consecutive. */
export interface QueuedCardAt {
  card: string;
  position: number;
}

/**
 * A player's queue, in order, once an undo puts back the cards its pick took
 * out of it. `queue` is the queue as it is now, and `takenOut` the cards the
 * pick took out, each where it was then, both lowest position first.
 * `restKept` is whether the rest of the queue stayed when they were taken
 * out: for a lost card, whether anything else stayed queued, so false for
 * the last card left in a queue; always true for the picker's own picked
 * card; and false for a queue cleared under clear queue, which picks no
 * longer do but an undo of a pick made before then still puts back. Cards
 * taken out while the rest was kept go
 * back in their old place among the cards queued now: after those whose
 * positions come before them, so after as many as were ahead of them,
 * unless since reordered. Otherwise they come back at the front, in their
 * original order, ahead of anything queued since. A card both put back and
 * queued again since is held once, in the first of its two places.
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
