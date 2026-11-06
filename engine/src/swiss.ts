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
 * Players are taken best first, those sharing a rank in an order the seed
 * fixes, and each is paired with the next player they haven't played, so
 * players meet others on their match points and an odd score group pairs
 * its last player down. A backtracking search finds matches with no
 * rematches whenever any exist; only if none do does it allow them. With an
 * odd count, the bye goes to the lowest-ranked player who hasn't had one
 * and leaves matches with no rematches; if every player has had one, to
 * the lowest-ranked player.
 */
export function pairSwissRound({
  standings,
  pastMatches,
  pastByes,
  dropped,
  seed,
}: SwissPairerInput): ScheduledRound {
  const out = new Set(dropped);
  // Shuffled, then stably sorted by rank: the seed orders players sharing a rank.
  const order = shuffle(
    standings.filter(({ playerId }) => !out.has(playerId)),
    seededRandom(seed),
  )
    .sort((a, b) => a.rank - b.rank)
    .map(({ playerId }) => playerId);
  const met = new Set(pastMatches.map(pairKey));
  const fresh = (a: string, b: string) => !met.has(pairKey([a, b]));
  const anyone = () => true;

  if (order.length % 2 === 0) {
    return {
      matches: (pairAll(order, fresh) ?? pairAll(order, anyone))!,
      bye: null,
    };
  }
  const hadBye = new Set(pastByes);
  const lowestFirst = [...order].reverse();
  const candidates = [
    ...lowestFirst.filter((id) => !hadBye.has(id)),
    ...lowestFirst.filter((id) => hadBye.has(id)),
  ];
  for (const bye of candidates) {
    const matches = pairAll(
      order.filter((id) => id !== bye),
      fresh,
    );
    if (matches) return { matches, bye };
  }
  const bye = candidates[0];
  return {
    matches: pairAll(
      order.filter((id) => id !== bye),
      anyone,
    )!,
    bye,
  };
}

/**
 * Pairs every player of `order`, each in turn with the earliest player
 * after them that `canMeet` allows, backtracking when the rest can't be
 * paired; null if there is no way to pair them all.
 */
function pairAll(
  order: readonly string[],
  canMeet: (a: string, b: string) => boolean,
): [string, string][] | null {
  if (order.length === 0) return [];
  const [first, ...rest] = order;
  for (const [i, opponent] of rest.entries()) {
    if (!canMeet(first, opponent)) continue;
    const others = pairAll(
      rest.filter((_, j) => j !== i),
      canMeet,
    );
    if (others) return [[first, opponent], ...others];
  }
  return null;
}

/** The same key for a pair of players whichever way round they are given. */
function pairKey([a, b]: readonly [string, string]) {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`;
}
