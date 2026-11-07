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

/**
 * The picks a cascade makes, each with its effects: while the seat whose
 * turn it is has a card in its queue not yet picked, it picks the first such
 * card. `queues` are each seat's queued cards in order, indexed by seat; a
 * seat with an empty queue, such as a bot's, stops the cascade. After each
 * pick, queues change as `queuesAfterPick` says: a queued copy of the picked
 * card may be swapped for another copy, or lost. Under clear queue, a lost card
 * clears that queue and stops the cascade at that seat's next turn; under
 * pick next, as that seat's entry in `stealBehaviors` may say, the rest of
 * its queue carries on. `plans` are each seat's planned cards, picked or
 * not, indexed by seat; they change with each pick, as `plansAfterPick`
 * says, but never stop or steer the cascade. Cards are pool card ids, as in
 * `pool` and `picked`.
 */
export function cascade(
  draft: DraftPicks,
  queues: readonly (readonly string[])[],
  pool: Pool,
  stealBehaviors: readonly StealBehavior[],
  plans: readonly (readonly string[])[],
): CascadePick[] {
  const picked = [...draft.picked];
  const pickedBefore = new Set(picked);
  let remaining = queues;
  let planned = plans;
  const picks: CascadePick[] = [];
  for (;;) {
    const turn = currentTurn(draft, picked.length);
    if (!turn) return picks;
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
