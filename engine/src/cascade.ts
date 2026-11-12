import type { DraftPicks } from './pick.js';
import { type PlanAfterPick, plansAfterPick } from './plan.js';
import type { Pool } from './copies.js';
import {
  type QueueAfterPick,
  queuesAfterPick,
  type SeatPick,
  type StealBehavior,
} from './queue.js';
import { currentTurn } from './turn.js';

/** A pick made from a queue. */
export type QueuedPick = SeatPick;

/** A pick a cascade makes, with what it does to every queue and plan. */
export interface CascadePick {
  pick: QueuedPick;
  /** Each seat's queue after the pick, as `queuesAfterPick` says. */
  queues: QueueAfterPick[];
  /** Each seat's plan after the pick, as `plansAfterPick` says. */
  plans: PlanAfterPick[];
}

/** What a cascade takes of one seat, as it is when the cascade starts. */
export interface CascadeSeat {
  /** The seat's queued cards, in order; empty for a bot, which picks on its own timer. */
  queue: readonly string[];
  /** What a card lost from the queue does to the rest of it. */
  stealBehavior: StealBehavior;
  /** The seat's planned cards, picked or not. */
  plan: readonly string[];
  /** Whether the seat's queue is queue paused, making no queued picks. */
  queuePaused: boolean;
}

/**
 * The picks a cascade makes, each with its effects: while the seat whose
 * turn it is has a card in its queue not yet picked, and its queue is not
 * paused, it picks the first such card. `seats` are indexed by seat. A seat
 * with an empty queue, such as a bot's, stops the cascade, and so does a
 * seat whose queue is queue paused. After each pick, queues change as
 * `queuesAfterPick` says: a queued copy of the picked card may be swapped
 * for another copy, or lost. Under clear queue, a lost card clears that
 * queue and stops the cascade at that seat's next turn; under pick next, the
 * rest of its queue carries on. Plans change with each pick, as
 * `plansAfterPick` says, but never stop or steer the cascade. Cards are pool
 * card ids, as in `pool` and `picked`.
 */
export function cascade(
  draft: DraftPicks,
  seats: readonly CascadeSeat[],
  pool: Pool,
): CascadePick[] {
  const picked = [...draft.picked];
  const pickedBefore = new Set(picked);
  const stealBehaviors = seats.map((seat) => seat.stealBehavior);
  let remaining: readonly (readonly string[])[] = seats.map(
    (seat) => seat.queue,
  );
  let planned: readonly (readonly string[])[] = seats.map((seat) => seat.plan);
  const picks: CascadePick[] = [];
  for (;;) {
    const turn = currentTurn(draft, picked.length);
    // Stryker disable next-line OptionalChaining: there is one entry per seat, so `seats[turn.seat]` always exists.
    if (!turn || seats[turn.seat]?.queuePaused) return picks;
    // Stryker disable next-line OptionalChaining: there is one queue per seat, so `remaining[turn.seat]` always exists.
    const card = remaining[turn.seat]?.find(
      (queued) => !pickedBefore.has(queued),
    );
    if (card === undefined) return picks;
    const pick = { seat: turn.seat, card };
    const queuesAfter = queuesAfterPick(pick, remaining, {
      pool,
      picked,
      stealBehaviors,
    });
    const plansAfter = plansAfterPick(pick, planned, { pool, picked });
    picks.push({ pick, queues: queuesAfter, plans: plansAfter });
    remaining = queuesAfter.map((after) => after.queue);
    planned = plansAfter.map((after) => after.plan);
    picked.push(card);
  }
}
