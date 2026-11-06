import { describe, expect, it } from 'vitest';
import { seededRandom } from './shuffle.js';
import {
  pairSwissRound,
  swissRoundCount,
  type SwissStanding,
} from './swiss.js';
import {
  GAME_SCORES,
  swissStandings,
  type ScheduledRound,
  type TournamentMatch,
} from './tournament.js';

describe('swissRoundCount', () => {
  it('plays until there’s a winner: ⌈log₂ joined players⌉ tournament rounds', () => {
    const counts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((joined) =>
      swissRoundCount(joined, 'UntilWinner'),
    );
    expect(counts).toEqual([1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
  });

  it('caps the tournament rounds at 3', () => {
    const counts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((joined) =>
      swissRoundCount(joined, 'CappedAt3'),
    );
    expect(counts).toEqual([1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3]);
  });
});

/** Standings in the order given, each player on the match points given, ranks shared by equal points. */
function table(...entries: [string, number][]): SwissStanding[] {
  return entries.map(([playerId, matchPoints]) => ({
    playerId,
    matchPoints,
    rank: entries.findIndex(([, points]) => points === matchPoints) + 1,
  }));
}

/** Each pair of a round, sorted, as "a-b", so rounds compare without caring for player order. */
function pairs(round: ScheduledRound) {
  return round.matches.map((match) => [...match].sort().join('-')).sort();
}

const noHistory = { pastMatches: [], pastByes: [], dropped: [] };

describe('pairSwissRound', () => {
  it('pairs players within their match points when every score group is even', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: table(['a', 3], ['b', 3], ['c', 0], ['d', 0]),
      seed: 1,
    });
    expect(pairs(round)).toEqual(['a-b', 'c-d']);
    expect(round.bye).toBeNull();
  });

  it('pairs one player down from an odd score group', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: table(
        ['a', 3],
        ['b', 3],
        ['c', 3],
        ['d', 0],
        ['e', 0],
        ['f', 0],
      ),
      seed: 1,
    });
    const top = new Set(['a', 'b', 'c']);
    const across = round.matches.filter(([x, y]) => top.has(x) !== top.has(y));
    expect(across).toHaveLength(1);
  });

  it('never pairs a rematch, pairing down further instead', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: table(['a', 3], ['b', 3], ['c', 0], ['d', 0]),
      pastMatches: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      seed: 1,
    });
    expect(pairs(round)).not.toContain('a-b');
    expect(pairs(round)).not.toContain('c-d');
    expect(round.matches).toHaveLength(2);
  });

  it('keeps a score group together when a rematch would split it, rather than pair two players down', () => {
    // c has played d, but a–c and b–d, or a–d and b–c, keep everyone on 3
    // match points together.
    const round = pairSwissRound({
      ...noHistory,
      standings: table(
        ['a', 3],
        ['b', 3],
        ['c', 3],
        ['d', 3],
        ['e', 0],
        ['f', 0],
      ),
      pastMatches: [['c', 'd']],
      seed: 1,
    });
    expect([
      ['a-c', 'b-d', 'e-f'],
      ['a-d', 'b-c', 'e-f'],
    ]).toContainEqual(pairs(round));
  });

  it('pairs as few rematches as it can when every way of pairing has one', () => {
    // a has played everyone, and a–b, a–c both bring a second rematch along.
    const round = pairSwissRound({
      ...noHistory,
      standings: table(['a', 3], ['b', 3], ['c', 0], ['d', 0]),
      pastMatches: [
        ['a', 'b'],
        ['c', 'd'],
        ['a', 'c'],
        ['b', 'd'],
        ['a', 'd'],
      ],
      seed: 1,
    });
    expect(pairs(round)).toEqual(['a-d', 'b-c']);
  });

  it('pairs a rematch rather than give a second bye while a player hasn’t had one', () => {
    // A bye to a or b leaves a rematch; a second bye to c would leave none.
    const round = pairSwissRound({
      ...noHistory,
      standings: table(['a', 3], ['c', 3], ['b', 0]),
      pastMatches: [
        ['a', 'c'],
        ['b', 'c'],
      ],
      pastByes: ['c'],
      seed: 1,
    });
    expect(round.bye).toBe('b');
    expect(pairs(round)).toEqual(['a-c']);
  });

  it('gives the bye to the lowest-ranked player who hasn’t had one', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: table(['a', 6], ['b', 3], ['c', 3], ['d', 3], ['e', 0]),
      pastByes: ['e'],
      seed: 1,
    });
    expect(round.bye).toBe('d');
    expect(pairs(round)).toHaveLength(2);
  });

  it('never pairs a dropped player, nor gives them the bye', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const round = pairSwissRound({
        ...noHistory,
        standings: table(['a', 6], ['b', 3], ['c', 3], ['d', 3], ['e', 0]),
        dropped: ['b', 'e'],
        seed,
      });
      const seated = [...round.matches.flat(), round.bye];
      expect(seated).not.toContain('b');
      expect(seated).not.toContain('e');
      expect(round.bye).not.toBeNull();
      expect(pairs(round)).toHaveLength(1);
    }
  });

  it('is deterministic for a seed, and pairs round 1 at random', () => {
    const players = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const roundOne = (seed: number) =>
      pairSwissRound({
        ...noHistory,
        standings: players.map((playerId) => ({
          playerId,
          rank: 1,
          matchPoints: 0,
        })),
        seed,
      });

    expect(roundOne(7)).toEqual(roundOne(7));
    const seen = new Set(
      [1, 2, 3, 4, 5].map((seed) => pairs(roundOne(seed)).join(' ')),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  describe.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'over every tournament round for %i players',
    (count) => {
      it.each([1, 2, 3, 4, 5])('with seed %i', (seed) => {
        const players = Array.from({ length: count }, (_, i) => `p${i + 1}`);
        const random = seededRandom(seed * 1000 + count);
        const played: TournamentMatch[] = [];
        const byes: string[] = [];

        for (let r = 0; r < swissRoundCount(count, 'UntilWinner'); r++) {
          const standings = swissStandings(players, played, byes);
          const round = pairSwissRound({
            standings,
            pastMatches: played.map((match) => match.players),
            pastByes: byes,
            dropped: [],
            seed: seed + r,
          });

          const met = new Set(played.map(({ players: p }) => pairKey(p)));
          for (const match of round.matches) {
            expect(met.has(pairKey(match))).toBe(false);
          }
          const seated = [
            ...round.matches.flat(),
            ...(round.bye ? [round.bye] : []),
          ];
          expect([...seated].sort()).toEqual([...players].sort());

          // No few matches could be paired again among their own players, with
          // no rematch, so that fewer of them cross score groups.
          const points = new Map(
            standings.map((s) => [s.playerId, s.matchPoints]),
          );
          const pairDowns = (matches: (readonly [string, string])[]) =>
            matches.filter(([a, b]) => points.get(a) !== points.get(b)).length;
          for (const few of subsets(round.matches, 3)) {
            for (const other of matchings(few.flat())) {
              if (other.some((match) => met.has(pairKey(match)))) continue;
              expect(pairDowns(other)).toBeGreaterThanOrEqual(pairDowns(few));
            }
          }

          if (count % 2 === 1) {
            const lowestWithout = standings
              .filter(({ playerId }) => !byes.includes(playerId))
              .at(-1)!;
            const bye = standings.find((s) => s.playerId === round.bye)!;
            expect(byes).not.toContain(round.bye);
            expect(bye.rank).toBe(lowestWithout.rank);
            byes.push(round.bye!);
          } else {
            expect(round.bye).toBeNull();
          }

          for (const match of round.matches) {
            const games = GAME_SCORES[Math.floor(random() * 4)];
            played.push({
              players: match,
              outcome: { kind: 'GameScore', games: [...games], draws: 0 },
            });
          }
        }
      });
    },
  );
});

function pairKey(players: readonly [string, string]) {
  return [...players].sort().join('-');
}

/** Every subset of `items` of 2 to `most` items. */
function subsets<T>(items: readonly T[], most: number): T[][] {
  const all = items.reduce<T[][]>(
    (found, item) => [
      ...found,
      ...found
        .filter((subset) => subset.length < most)
        .map((subset) => [...subset, item]),
    ],
    [[]],
  );
  return all.filter((subset) => subset.length >= 2);
}

/** Every way of pairing all of an even number of `players`. */
function matchings(players: readonly string[]): [string, string][][] {
  if (players.length === 0) return [[]];
  const [first, ...rest] = players;
  return rest.flatMap((opponent, i) =>
    matchings(rest.filter((_, j) => j !== i)).map(
      (others): [string, string][] => [[first, opponent], ...others],
    ),
  );
}
