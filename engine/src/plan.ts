import {
  availableCopies,
  ownPickCopy,
  type Pool,
  type Swap,
  swapOrLose,
} from './copies.js';
import type { SeatPick } from './queue.js';

/** One seat's plan after a pick. */
export interface PlanAfterPick {
  /** The planned cards, picked or not, as they now are. */
  plan: string[];
  /**
   * A copy swapped for another in the same place: in another plan, the
   * picked card for an available copy; in the picker's, an unpicked copy for
   * the picked card itself, which is now their pick.
   */
  swapped?: Swap;
  /** The picked card, if the plan lost it: no copy was available for the plan. */
  lost?: string;
}

/**
 * What a pick does to plans, which are each seat's planned cards, picked or
 * not, indexed by seat. In the picker's plan, the planned card the pick
 * accounts for, as `ownPickCopy` says, is now their pick: kept if it is
 * the picked card, otherwise swapped, in the same place, for the picked
 * card. In each other plan holding the card, it is swapped for a copy or
 * lost, as `swapOrLose` says, with the copies in `pool` that are not
 * `picked`.
 * Nothing else in a plan changes: a plan never picks, so there is nothing
 * to clear. `picked` is the cards picked before this one, with or without
 * it. Cards are pool card ids.
 */
export function plansAfterPick(
  pick: SeatPick,
  plans: readonly (readonly string[])[],
  { pool, picked }: { pool: Pool; picked: readonly string[] },
): PlanAfterPick[] {
  const copies = availableCopies(pick.card, pool, picked);
  return plans.map((plan, seat) => {
    if (seat === pick.seat) {
      const planned = ownPickCopy(plan, pick.card, copies);
      return planned === undefined || planned === pick.card
        ? { plan: [...plan] }
        : {
            plan: plan.with(plan.indexOf(planned), pick.card),
            swapped: { out: planned, in: pick.card },
          };
    }
    const { cards, ...swappedOrLost } = swapOrLose(plan, pick.card, copies);
    return { plan: cards, ...swappedOrLost };
  });
}
