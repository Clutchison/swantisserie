import { availableCopies, type Pool, type SeatPick } from './queue.js';

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
 * swapped, in the same place, for the first copy in `pool` that is not
 * `picked` and that the plan doesn't hold; with no such copy, it is lost.
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
    if (at === -1) return { plan: [...plan] };
    const copy = copies.find((card) => !plan.includes(card));
    return copy === undefined
      ? { plan: plan.toSpliced(at, 1), lost: pick.card }
      : { plan: plan.with(at, copy), swapped: { out: pick.card, in: copy } };
  });
}
