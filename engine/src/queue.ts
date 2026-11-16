import {
  availableCopies,
  ownPickCopy,
  type Pool,
  type Swap,
  swapOrLose,
} from './copies.js';
import type { DraftPicks } from './pick.js';
import { currentTurn } from './turn.js';

/**
 * What a lost card does to a player's queue, whose rest stays in order
 * either way: under pause queue the queue is set to queue paused; under
 * pick next it stays queue picking.
 */
export type StealBehavior = 'PauseQueue' | 'PickNext';

/**
 * A deck board, which the code calls a plan board (ADR 0018): the mainboard
 * or the sideboard.
 */
export type PlanBoard = 'Mainboard' | 'Sideboard';

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

/** A queued card and the deck board it sits on. */
export interface QueuedCopy {
  card: string;
  board: PlanBoard;
}

/**
 * A seat's queue state: its queued copies, in order, each on its deck
 * board, its steal behavior, and whether it is queue paused. Cards are pool
 * card ids.
 */
export interface SeatQueue {
  /** The queued copies, in order. */
  queue: readonly QueuedCopy[];
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

/** What a pick does to every queue, and where it lands in its picker's deck. */
export interface QueuesAfterPick {
  /** Each seat's queue state after the pick, indexed by seat. */
  queues: QueueAfterPick[];
  /** The deck board the pick lands on in its picker's deck. */
  landsOn: PlanBoard;
}

/** A pick, what it does to every queue, and where it lands. */
export interface PickEffects extends QueuesAfterPick {
  pick: SeatPick;
}

/**
 * What a pick does to `queues`, each seat's queue state, indexed by seat.
 * The queued copy the pick accounts for, as `ownPickCopy` says, leaves the
 * picker's queue, so the queue doesn't pick a second copy. The pick lands
 * on that copy's deck board, or the mainboard when it accounts for none,
 * which the result gives as `landsOn`. The copies are those in
 * `pool` that are not `picked`. In each other queue holding it, it is
 * swapped for a copy or lost, as `swapOrLose` says; swapped or lost, the
 * rest of the queue stays in order. A swapped-in copy takes the stolen
 * copy's deck board. A loss sets a queue picking queue paused, unless its
 * steal behavior is pick next. Nothing else changes a queue's state.
 * `picked` is the cards picked already, with or without this one. Cards are
 * pool card ids.
 */
export function queuesAfterPick(
  pick: SeatPick,
  queues: readonly SeatQueue[],
  { pool, picked }: { pool: Pool; picked: readonly string[] },
): QueuesAfterPick {
  const copies = availableCopies(pick.card, pool, picked);
  const queued = ownPickCopy(queues[pick.seat].queue, pick.card, copies);
  const after = queues.map(({ queue, stealBehavior, queuePaused }, seat) => {
    if (seat === pick.seat) {
      return {
        queue: queue.filter((copy) => copy !== queued),
        stealBehavior,
        queuePaused,
      };
    }
    const { swapped, lost, ...rest } = swapOrLose(queue, pick.card, copies);
    if (lost === undefined) {
      return {
        queue: rest.queue,
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
      queue: rest.queue,
      stealBehavior,
      queuePaused: queueLoss !== 'StayedQueuePicking',
      lost: { card: lost, queueLoss },
    };
  });
  return { queues: after, landsOn: queued?.board ?? 'Mainboard' };
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
): PickEffects | undefined {
  const turn = currentTurn(draft, draft.picked.length);
  if (!turn) return undefined;
  const { queue, queuePaused } = queues[turn.seat];
  if (queuePaused) return undefined;
  const next = queue.find(({ card }) => !draft.picked.includes(card));
  if (next === undefined) return undefined;
  const pick = { seat: turn.seat, card: next.card };
  return {
    pick,
    ...queuesAfterPick(pick, queues, { pool, picked: draft.picked }),
  };
}

/** A queued card, its deck board, and its place in the queue: lowest first, not necessarily consecutive. */
export interface QueuedCardAt extends QueuedCopy {
  position: number;
}

/**
 * A player's queue, in order, once an undo puts back the cards its pick took
 * out of it. `queue` is the queue as it is now, and `takenOut` the cards the
 * pick took out, each where it was then, both lowest position first.
 * `restKept` is whether the rest of the queue stayed when they were taken
 * out: for a lost card, whether anything else stayed queued, so false for
 * the last card left in a queue; always true for the picker's own picked
 * card, or the queued copy of it that left instead; and false for a queue
 * cleared under clear queue, which picks no longer do but an undo of a pick
 * made before then still puts back. Cards taken out while the rest was kept
 * go back in their old place among the cards queued now: after those whose
 * positions come before them, so after as many as were ahead of them,
 * unless since reordered. Otherwise they come back at the front, in their
 * original order, ahead of anything queued since. A card both put back and
 * queued again since is held once, in the first of its two places, on the
 * deck board it has there. Every card keeps its deck board, so a taken-out
 * card goes back on the board it was on.
 */
export function queueAfterUndo(
  queue: readonly QueuedCardAt[],
  takenOut: readonly QueuedCardAt[],
  { restKept }: { restKept: boolean },
): QueuedCopy[] {
  const at =
    restKept && takenOut.length > 0
      ? queue.filter((queued) => queued.position < takenOut[0].position).length
      : 0;
  const held = new Set<string>();
  return queue.toSpliced(at, 0, ...takenOut).flatMap(({ card, board }) => {
    if (held.has(card)) return [];
    held.add(card);
    return [{ card, board }];
  });
}
