import {
  availableCopies,
  swapOrLose,
  type Pool,
  type SeatPick,
} from './queue.js';

/** One seat's plan after a pick. */
export interface PlanAfterPick {
  /** The planned cards, picked or not, as they now are. */
  plan: string[];
  /**
   * A copy swapped for another in the same place: in another plan, the
   * picked card for an available copy; in the picker's, an unpicked copy for
   * the picked card itself, which is now their pick.
   */
  swapped?: { out: string; in: string };
  /** The picked card, if the plan lost it: no copy was available for the plan. */
  lost?: string;
}

/**
 * What a pick does to plans, which are each seat's planned cards, picked or
 * not, indexed by seat. The picker's plan keeps the card, if it holds it:
 * it is now their pick; if it instead holds an unpicked copy of it, that
 * copy becomes the pick. In each other plan holding the card, it is
 * swapped for a copy or lost, as `swapOrLose` says, with the copies in
 * `pool` that are not `picked`.
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
    const at = plan.indexOf(pick.card);
    if (seat === pick.seat) {
      if (at !== -1) return { plan: [...plan] };
      const unpicked = plan.findIndex((card) => copies.includes(card));
      return unpicked === -1
        ? { plan: [...plan] }
        : {
            plan: plan.with(unpicked, pick.card),
            swapped: { out: plan[unpicked], in: pick.card },
          };
    }
    const { list, ...swappedOrLost } = swapOrLose(plan, pick.card, copies);
    return { plan: list, ...swappedOrLost };
  });
}
