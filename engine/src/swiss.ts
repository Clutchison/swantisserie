import { seededRandom, shuffle } from './shuffle.js';
import {
  ranked,
  standingOf,
  type DecidedMatch,
  type ScheduledRound,
  type Standing,
  type TournamentMatch,
} from './tournament.js';

/**
 * How many tournament rounds a Swiss tournament plays, chosen at tournament
 * setup: until there's a winner, or capped at SWISS_ROUND_CAP.
 */
export type SwissRoundOption = 'UntilWinner' | 'CappedAt3';

/** The most tournament rounds a Swiss tournament capped at 3 plays. */
export const SWISS_ROUND_CAP = 3;

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

/** The MTR's floor for every Swiss percentage: 33, meaning 33% (the MTR's 0.33). */
export const SWISS_PERCENT_FLOOR = 33;

/**
 * The standings of a Swiss tournament's `players` after `matches`, best
 * first, with `byes` holding the player with each bye so far, once per bye.
 * A bye counts as a 2–0 win. Players rank by the MTR's order (Appendix C):
 * match points, then opponents' match-win %, game-win %, then opponents'
 * game-win %.
 *
 * - Match-win % is match points over 3 per tournament round played, so a
 *   player who stopped playing is measured over the tournament rounds they played.
 * - Game-win % is game points (3 a game won, 1 a game drawn) over 3 per
 *   game played.
 * - Each is floored at 33%, and the opponents' percentages average each
 *   opponent's, leaving the player's byes out.
 *
 * The floor has no exception: before a player has played a game, or met an
 * opponent, the percentages that need one are 33%. Players still tied
 * after every tiebreaker share a rank and keep the order of `players`, the
 * rank after a shared one skipping, as in 1, 1, 3. Unreported matches
 * count for nothing.
 */
export function swissStandings(
  players: readonly string[],
  matches: readonly TournamentMatch[],
  byes: readonly string[],
): Standing[] {
  const decided = matches.filter(
    (match): match is DecidedMatch => match.outcome !== null,
  );
  const all = new Map(
    players.map((playerId) => {
      const standing = standingOf(
        playerId,
        decided,
        byes.filter((id) => id === playerId).length,
      );
      const { won, lost, drawn } = standing.games;
      const played = won + lost + drawn;
      standing.gameWinPercent = floored(
        played === 0 ? 0 : (3 * won + drawn) / (3 * played),
      );
      return [playerId, standing];
    }),
  );
  const matchWin = ({ matchPoints, matches }: Standing) =>
    floored(matchPoints / (3 * (matches.won + matches.lost + matches.drawn)));
  // With no opponent yet, the average is the floor.
  const average = (values: number[]) =>
    values.length === 0
      ? SWISS_PERCENT_FLOOR
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  for (const standing of all.values()) {
    const opponents = decided.flatMap(({ players: [a, b] }) =>
      a === standing.playerId
        ? [all.get(b)!]
        : b === standing.playerId
          ? [all.get(a)!]
          : [],
    );
    standing.opponentsMatchWinPercent = average(opponents.map(matchWin));
    standing.opponentsGameWinPercent = average(
      opponents.map((opponent) => opponent.gameWinPercent),
    );
  }

  const compare = (a: Standing, b: Standing) =>
    b.matchPoints - a.matchPoints ||
    highestPercentFirst(
      a.opponentsMatchWinPercent!,
      b.opponentsMatchWinPercent!,
    ) ||
    highestPercentFirst(a.gameWinPercent, b.gameWinPercent) ||
    highestPercentFirst(a.opponentsGameWinPercent!, b.opponentsGameWinPercent!);
  return ranked([...all.values()], compare);
}

/** `fraction` as a percentage, floored at the MTR's 33%. */
function floored(fraction: number): number {
  return Math.max(SWISS_PERCENT_FLOOR, 100 * fraction);
}

/**
 * Compares percentages `a` and `b` to sort the higher first, treating two
 * that differ only by floating-point noise as equal.
 */
function highestPercentFirst(a: number, b: number): number {
  return Math.abs(b - a) < 1e-9 ? 0 : b - a;
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
  /** Orders the players who share a rank, so the same input and RNG seed pair the same way. */
  rngSeed: number;
}

/**
 * The next tournament round of a Swiss tournament: its matches and its bye.
 * A search over every way of pairing the players left in finds the best,
 * judged in turn by:
 *
 * 1. with an odd count, the bye to a player who hasn't had one, while any
 *    player left in hasn't had one;
 * 2. the bye to the lowest-ranked such player (with every player left in
 *    having had one, to the lowest-ranked player left in), whatever
 *    rematches that leaves;
 * 3. then, among the players who remain, the fewest rematches: none
 *    whenever that is possible;
 * 4. the fewest pair-downs, matches between players on different match
 *    points, so an even score group stays together and an odd one pairs
 *    one player down;
 * 5. the smallest gaps in match points across those pair-downs.
 *
 * Ties go to the way of pairing that comes first with players taken best
 * first, those sharing a rank in an order the RNG seed fixes, so round 1 pairs
 * at random and the same input and RNG seed always pair the same way.
 */
export function pairSwissRound({
  standings,
  pastMatches,
  pastByes,
  dropped,
  rngSeed,
}: SwissPairerInput): ScheduledRound {
  const out = new Set(dropped);
  const left = standings.filter(({ playerId }) => !out.has(playerId));
  // Shuffled, then stably sorted by rank: the RNG seed orders players sharing a rank.
  const order = shuffle(left, seededRandom(rngSeed))
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
  const bye = order.findLast((id) => !hadBye.has(id)) ?? order.at(-1)!;
  const { matches } = bestPairing(
    order.filter((id) => id !== bye),
    costOf,
  );
  return { matches, bye };
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
