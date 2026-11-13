/** The fewest double picks a draft with double picks can have: one double turn. */
export const MIN_DOUBLE_PICKS = 2;

/**
 * The rule for a draft's double picks with `picksPerPlayer`, as the message
 * that refuses a number breaking it. The message is for the organizer.
 *
 * Every double turn makes two picks, so the number is even, and it is no
 * greater than picks per player, so double turns start at a round boundary.
 */
export function doublePicksRule(picksPerPlayer: number): string {
  return picksPerPlayer < MIN_DOUBLE_PICKS
    ? `Double picks need at least ${MIN_DOUBLE_PICKS} picks per player.`
    : `Double picks must be an even number from ${MIN_DOUBLE_PICKS} to ${picksPerPlayer}.`;
}

/**
 * Why a draft can't have `doublePicks` of its `picksPerPlayer` on double
 * turns, as {@link doublePicksRule} says it, or null if it can.
 */
export function doublePicksProblem(
  doublePicks: number,
  picksPerPlayer: number,
): string | null {
  const allowed =
    Number.isInteger(doublePicks) &&
    doublePicks % 2 === 0 &&
    doublePicks >= MIN_DOUBLE_PICKS &&
    doublePicks <= picksPerPlayer;
  return allowed ? null : doublePicksRule(picksPerPlayer);
}

/**
 * The double picks a draft starts with when the organizer turns them on:
 * `preferred`, or the largest even number no greater than `picksPerPlayer`
 * if that is lower.
 */
export function startingDoublePicks(
  picksPerPlayer: number,
  preferred: number,
): number {
  const most = Math.min(preferred, picksPerPlayer);
  return most - (most % 2);
}
