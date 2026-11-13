/** The fewest double picks a draft with double picks can have: one double turn. */
const MIN_DOUBLE_PICKS = 2;

/**
 * Why a draft can't have `doublePicks` of its `picksPerPlayer` on double
 * turns, or null if it can. The message is for the organizer.
 *
 * Every double turn makes two picks, so the number is even, and it is no
 * greater than picks per player, so double turns start at a round boundary.
 */
export function doublePicksProblem(
  doublePicks: number,
  picksPerPlayer: number,
): string | null {
  if (picksPerPlayer < MIN_DOUBLE_PICKS) {
    return `Double picks need at least ${MIN_DOUBLE_PICKS} picks per player.`;
  }
  if (
    !Number.isInteger(doublePicks) ||
    doublePicks % 2 !== 0 ||
    doublePicks < MIN_DOUBLE_PICKS ||
    doublePicks > picksPerPlayer
  ) {
    return `Double picks must be an even number from ${MIN_DOUBLE_PICKS} to ${picksPerPlayer}.`;
  }
  return null;
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
