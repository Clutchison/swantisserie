import { seededRandom, shuffle } from './shuffle.js';
import type { ScheduledRound, Standing } from './tournament.js';

/**
 * How many tournament rounds a Swiss tournament plays, chosen at tournament
 * setup: until there's a winner, or capped at SWISS_ROUND_CAP.
 */
export type SwissRoundOption = 'UntilWinner' | 'CappedAt3';

/** The most tournament rounds a Swiss tournament capped at 3 plays. */
export const SWISS_ROUND_CAP = 3;

/**
 * The fewest undropped players a Swiss tournament pairs another tournament
 * round for. With fewer, Complete round completes the tournament.
 */
export const MIN_UNDROPPED_PLAYERS = 2;

/**
 * How many tournament rounds a Swiss tournament of `joined` players plays:
 * ⌈log₂ joined⌉ until there's a winner, at most SWISS_ROUND_CAP when capped.
 */
export function swissRoundCount(
  joined: number,
  option: SwissRoundOption,
): number {
  const untilWinner = Math.max(1, Math.ceil(Math.log2(joined)));
  return option === 'CappedAt3'
    ? Math.min(untilWinner, SWISS_ROUND_CAP)
    : untilWinner;
}

/** What the Swiss pairer reads of a player's standing. */
export type SwissStanding = Pick<Standing, 'playerId' | 'rank' | 'matchPoints'>;

/** What the Swiss pairer pairs the next tournament round from. */
export interface SwissPairerInput {
  /** Every player in the tournament, dropped or not, best first, as the standings so far rank them. */
  standings: readonly SwissStanding[];
  /** The two players of every match paired so far. */
  pastMatches: readonly (readonly [string, string])[];
  /** The player with each bye so far. */
  pastByes: readonly string[];
  /** Players who have dropped, whom the pairer leaves out. */
  dropped: readonly string[];
  /** Orders the players who share a rank, so the same input and seed pair the same way. */
  seed: number;
}

/**
 * The next tournament round of a Swiss tournament: its matches and its bye.
 * A search over every way of pairing the players left in finds the best,
 * judged in turn by:
 *
 * 1. the fewest rematches: none whenever that is possible;
 * 2. with an odd count, the bye to the lowest-ranked player who hasn't had
 *    one. Nobody gets a second bye while a player left in hasn't had one,
 *    even if it costs a rematch;
 * 3. the fewest pair-downs, matches between players on different match
 *    points, so an even score group stays together and an odd one pairs
 *    one player down;
 * 4. the smallest gaps in match points across those pair-downs.
 *
 * Ties go to the way of pairing that comes first with players taken best
 * first, those sharing a rank in an order the seed fixes, so round 1 pairs
 * at random and the same input and seed always pair the same way.
 */
export function pairSwissRound({
  standings,
  pastMatches,
  pastByes,
  dropped,
  seed,
}: SwissPairerInput): ScheduledRound {
  const out = new Set(dropped);
  const left = standings.filter(({ playerId }) => !out.has(playerId));
  // Shuffled, then stably sorted by rank: the seed orders players sharing a rank.
  const order = shuffle(left, seededRandom(seed))
    .sort((a, b) => a.rank - b.rank)
    .map(({ playerId }) => playerId);
  const points = new Map(left.map((s) => [s.playerId, s.matchPoints]));
  const met = new Set(pastMatches.map(pairKey));
  const costOf = (a: string, b: string): Cost => {
    const gap = Math.abs(points.get(a)! - points.get(b)!);
    return [met.has(pairKey([a, b])) ? 1 : 0, gap > 0 ? 1 : 0, gap];
  };

  if (order.length % 2 === 0) {
    return { matches: bestPairing(order, costOf).matches, bye: null };
  }
  const hadBye = new Set(pastByes);
  const lowestFirst = [...order].reverse();
  const withoutBye = lowestFirst.filter((id) => !hadBye.has(id));
  const candidates = withoutBye.length > 0 ? withoutBye : lowestFirst;
  let best: (Pairing & { bye: string }) | undefined;
  for (const bye of candidates) {
    const pairing = bestPairing(
      order.filter((id) => id !== bye),
      costOf,
    );
    // Only fewer rematches beat a lower-ranked bye.
    if (!best || pairing.cost[0] < best.cost[0]) best = { ...pairing, bye };
  }
  return { matches: best!.matches, bye: best!.bye };
}

/** What a way of pairing costs: its rematches, its pair-downs and its gaps in match points, compared in that order. */
type Cost = [number, number, number];

interface Pairing {
  matches: [string, string][];
  cost: Cost;
}

/**
 * The way of pairing every player of `order` that costs least by `costOf`,
 * the first in `order`'s order among equals. A branch and bound search:
 * a partial way of pairing that already costs as much as the best so far
 * is dropped.
 */
function bestPairing(
  order: readonly string[],
  costOf: (a: string, b: string) => Cost,
): Pairing {
  let best: Pairing | undefined;
  const search = (
    rest: readonly string[],
    matches: [string, string][],
    cost: Cost,
  ) => {
    if (best && compare(cost, best.cost) >= 0) return;
    if (rest.length === 0) {
      best = { matches, cost };
      return;
    }
    const [first, ...others] = rest;
    for (const [i, opponent] of others.entries()) {
      const added = costOf(first, opponent);
      search(
        others.filter((_, j) => j !== i),
        [...matches, [first, opponent]],
        [cost[0] + added[0], cost[1] + added[1], cost[2] + added[2]],
      );
    }
  };
  search(order, [], [0, 0, 0]);
  return best!;
}

function compare(a: Cost, b: Cost): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The same key for a pair of players whichever way round they are given. */
function pairKey([a, b]: readonly [string, string]) {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`;
}
