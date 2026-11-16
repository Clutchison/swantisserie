import type { DraftPicks } from './pick.js';
import type { Pool } from './copies.js';
import {
  nextQueuedPick,
  type QueuedPickEffects,
  type SeatQueue,
} from './queue.js';

/**
 * A pick a cascade makes, with what it does to every queue, including, in
 * the picker's, the deck board it lands on.
 */
export type CascadePick = QueuedPickEffects;

/**
 * The picks a cascade makes, each with its effects: one after another, the
 * pick `nextQueuedPick` says the queue of the seat whose turn it is makes.
 * `seats` are each seat's queue state as the cascade starts, indexed by
 * seat; a bot's queue is empty, as a bot picks on its own timer. A seat
 * with an empty queue stops the cascade, and so does a seat whose queue is
 * queue paused. After each pick, queues change as `queuesAfterPick` says: a
 * queued copy of the picked card may be swapped for another copy, or lost.
 * Under pause queue, a lost card pauses that queue, so the cascade stops at
 * that seat's next turn; under pick next, the queue stays queue picking and
 * its rest carries on. Cards are pool card ids, as in `pool` and `picked`.
 */
export function cascade(
  draft: DraftPicks,
  seats: readonly SeatQueue[],
  pool: Pool,
): CascadePick[] {
  const picked = [...draft.picked];
  let queues: readonly SeatQueue[] = seats;
  const picks: CascadePick[] = [];
  for (;;) {
    const next = nextQueuedPick({ ...draft, picked }, queues, pool);
    if (!next) return picks;
    picks.push(next);
    queues = next.queues;
    picked.push(next.pick.card);
  }
}
