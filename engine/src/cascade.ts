import type { DraftPicks } from './pick.js';
import { type PlanAfterPick, plansAfterPick } from './plan.js';
import type { Pool } from './copies.js';
import {
  nextQueuedPick,
  type QueueAfterPick,
  type SeatPick,
  type SeatQueue,
} from './queue.js';

/** A pick made from a queue. */
export type QueuedPick = SeatPick;

/** A pick a cascade makes, with what it does to every queue and plan. */
export interface CascadePick {
  pick: QueuedPick;
  /** Each seat's queue state after the pick, as `queuesAfterPick` says. */
  queues: QueueAfterPick[];
  /** Each seat's plan after the pick, as `plansAfterPick` says. */
  plans: PlanAfterPick[];
}

/**
 * What a cascade takes of one seat, as it is when the cascade starts: its
 * queue state, whose queue is empty for a bot, which picks on its own
 * timer, and its plan. A loss may pause its queue as the cascade goes.
 */
export interface CascadeSeat extends SeatQueue {
  /** The seat's planned cards, picked or not. */
  plan: readonly string[];
}

/**
 * The picks a cascade makes, each with its effects: one after another, the
 * pick `nextQueuedPick` says the queue of the seat whose turn it is makes.
 * `seats` are indexed by seat. A seat with an empty queue, such as a bot's,
 * stops the cascade, and so does a seat whose queue is queue paused. After
 * each pick, queues change as `queuesAfterPick` says: a queued copy of the
 * picked card may be swapped for another copy, or lost. Under pause queue,
 * a lost card pauses that queue, so the cascade stops at that seat's next
 * turn; under pick next, the queue stays queue picking and its rest carries
 * on. Plans change with each pick, as `plansAfterPick` says, but never stop
 * or steer the cascade. Cards are pool card ids, as in `pool` and `picked`.
 */
export function cascade(
  draft: DraftPicks,
  seats: readonly CascadeSeat[],
  pool: Pool,
): CascadePick[] {
  const picked = [...draft.picked];
  let queues: readonly SeatQueue[] = seats;
  let planned: readonly (readonly string[])[] = seats.map((seat) => seat.plan);
  const picks: CascadePick[] = [];
  for (;;) {
    const next = nextQueuedPick({ ...draft, picked }, queues, pool);
    if (!next) return picks;
    const { pick } = next;
    const plansAfter = plansAfterPick(pick, planned, { pool, picked });
    picks.push({ ...next, plans: plansAfter });
    queues = next.queues;
    planned = plansAfter.map((after) => after.plan);
    picked.push(pick.card);
  }
}
