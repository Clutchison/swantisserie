import { describe, expect, it } from 'vitest';
import { seededRandom } from './shuffle.js';
import {
  pairSwissRound,
  swissRoundCount,
  swissStandings,
  type SwissStanding,
} from './swiss.js';
import {
  GAME_SCORES,
  type ScheduledRound,
  type Standing,
  type TournamentMatch,
} from './tournament.js';
import { grantedDraw, placings, played } from './tournament.fixtures.js';

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
function standingsOf(...entries: [string, number][]): SwissStanding[] {
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
      standings: standingsOf(['a', 3], ['b', 3], ['c', 0], ['d', 0]),
      rngSeed: 1,
    });
    expect(pairs(round)).toEqual(['a-b', 'c-d']);
    expect(round.bye).toBeNull();
  });

  it('pairs one player down from an odd score group', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(
        ['a', 3],
        ['b', 3],
        ['c', 3],
        ['d', 0],
        ['e', 0],
        ['f', 0],
      ),
      rngSeed: 1,
    });
    const top = new Set(['a', 'b', 'c']);
    const across = round.matches.filter(([x, y]) => top.has(x) !== top.has(y));
    expect(across).toHaveLength(1);
  });

  it('never pairs a rematch, pairing down further instead', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(['a', 3], ['b', 3], ['c', 0], ['d', 0]),
      pastMatches: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      rngSeed: 1,
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
      standings: standingsOf(
        ['a', 3],
        ['b', 3],
        ['c', 3],
        ['d', 3],
        ['e', 0],
        ['f', 0],
      ),
      pastMatches: [['c', 'd']],
      rngSeed: 1,
    });
    expect([
      ['a-c', 'b-d', 'e-f'],
      ['a-d', 'b-c', 'e-f'],
    ]).toContainEqual(pairs(round));
  });

  it('pairs down across the smallest gaps in match points when rematches and pair-downs are level', () => {
    // c has played d, and d has played f. a–b, c–f, d–e pairs two players
    // down across gaps of 4 and 3 match points; a–c, b–d, e–f pairs two down
    // across gaps of 2 and 3.
    const round = pairSwissRound({
      ...noHistory,
      standings: [
        { playerId: 'a', rank: 1, matchPoints: 9 },
        { playerId: 'b', rank: 2, matchPoints: 9 },
        { playerId: 'c', rank: 3, matchPoints: 7 },
        { playerId: 'd', rank: 4, matchPoints: 6 },
        { playerId: 'e', rank: 5, matchPoints: 3 },
        { playerId: 'f', rank: 6, matchPoints: 3 },
      ],
      pastMatches: [
        ['c', 'd'],
        ['d', 'f'],
      ],
      rngSeed: 1,
    });
    expect(pairs(round)).toEqual(['a-c', 'b-d', 'e-f']);
  });

  it('pairs as few rematches as it can when every way of pairing has one', () => {
    // a has played everyone, and a–b, a–c both bring a second rematch along.
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(['a', 3], ['b', 3], ['c', 0], ['d', 0]),
      pastMatches: [
        ['a', 'b'],
        ['c', 'd'],
        ['a', 'c'],
        ['b', 'd'],
        ['a', 'd'],
      ],
      rngSeed: 1,
    });
    expect(pairs(round)).toEqual(['a-d', 'b-c']);
  });

  it('pairs a rematch rather than give a second bye while a player hasn’t had one', () => {
    // A bye to a or b leaves a rematch; a second bye to c would leave none.
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(['a', 3], ['c', 3], ['b', 0]),
      pastMatches: [
        ['a', 'c'],
        ['b', 'c'],
      ],
      pastByes: ['c'],
      rngSeed: 1,
    });
    expect(round.bye).toBe('b');
    expect(pairs(round)).toEqual(['a-c']);
  });

  it('gives the bye to the lowest-ranked player who hasn’t had one, even when that leaves a rematch', () => {
    // A bye to a would leave b–c, no rematch; the bye to c leaves a–b again.
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(['a', 6], ['b', 3], ['c', 0]),
      pastMatches: [
        ['a', 'b'],
        ['a', 'c'],
      ],
      rngSeed: 1,
    });
    expect(round.bye).toBe('c');
    expect(pairs(round)).toEqual(['a-b']);
  });

  it('gives the bye to the lowest-ranked player who hasn’t had one', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(['a', 6], ['b', 3], ['c', 3], ['d', 3], ['e', 0]),
      pastByes: ['e'],
      rngSeed: 1,
    });
    expect(round.bye).toBe('d');
    expect(pairs(round)).toHaveLength(2);
  });

  it('gives the bye to the lowest-ranked player left in when every player left in has had one', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(['a', 6], ['b', 3], ['c', 0], ['d', 0]),
      pastByes: ['a', 'b', 'c', 'd'],
      dropped: ['d'],
      rngSeed: 1,
    });
    expect(round.bye).toBe('c');
    expect(pairs(round)).toEqual(['a-b']);
  });

  it('never pairs a dropped player, nor gives them the bye', () => {
    for (const rngSeed of [1, 2, 3, 4, 5]) {
      const round = pairSwissRound({
        ...noHistory,
        standings: standingsOf(
          ['a', 6],
          ['b', 3],
          ['c', 3],
          ['d', 3],
          ['e', 0],
        ),
        dropped: ['b', 'e'],
        rngSeed,
      });
      const seated = [...round.matches.flat(), round.bye];
      expect(seated).not.toContain('b');
      expect(seated).not.toContain('e');
      expect(round.bye).not.toBeNull();
      expect(pairs(round)).toHaveLength(1);
    }
  });

  it('pairs no matches and gives no bye when every player has dropped', () => {
    const round = pairSwissRound({
      ...noHistory,
      standings: standingsOf(['a', 6], ['b', 3], ['c', 0]),
      dropped: ['a', 'b', 'c'],
      rngSeed: 1,
    });
    expect(round).toEqual({ matches: [], bye: null });
  });

  it('is deterministic for an RNG seed, and pairs round 1 at random', () => {
    const players = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const roundOne = (rngSeed: number) =>
      pairSwissRound({
        ...noHistory,
        standings: players.map((playerId) => ({
          playerId,
          rank: 1,
          matchPoints: 0,
        })),
        rngSeed,
      });

    expect(roundOne(7)).toEqual(roundOne(7));
    const seen = new Set(
      [1, 2, 3, 4, 5].map((rngSeed) => pairs(roundOne(rngSeed)).join(' ')),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('pairs players best first among equally good ways of pairing, whatever the RNG seed', () => {
    // Every way of pairing is free of rematches and pair-downs; no players
    // share a rank, so the RNG seed has nothing to order.
    for (const rngSeed of [1, 2, 3, 4, 5]) {
      const round = pairSwissRound({
        ...noHistory,
        standings: ['a', 'b', 'c', 'd'].map((playerId, i) => ({
          playerId,
          rank: i + 1,
          matchPoints: 3,
        })),
        rngSeed,
      });
      expect(pairs(round)).toEqual(['a-b', 'c-d']);
    }
  });

  describe.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'over every tournament round for %i players',
    (count) => {
      it.each([1, 2, 3, 4, 5])('with RNG seed %i', (rngSeed) => {
        const players = Array.from({ length: count }, (_, i) => `p${i + 1}`);
        const random = seededRandom(rngSeed * 1000 + count);
        const matchesSoFar: TournamentMatch[] = [];
        const byes: string[] = [];

        for (let r = 0; r < swissRoundCount(count, 'UntilWinner'); r++) {
          const standings = swissStandings(players, matchesSoFar, byes);
          const round = pairSwissRound({
            standings,
            pastMatches: matchesSoFar.map((match) => match.players),
            pastByes: byes,
            dropped: [],
            rngSeed: rngSeed + r,
          });

          const met = new Set(matchesSoFar.map(({ players: p }) => pairKey(p)));
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
            matchesSoFar.push({
              players: match,
              outcome: { kind: 'GameScore', games: [...games], draws: 0 },
            });
          }
        }
      });
    },
  );
});

describe('swissStandings', () => {
  it('counts a bye as a 2–0 win', () => {
    // a and c are level on opponents' match-win % (33%, floored), and c's
    // bye gives the better game-win %.
    const ranked = swissStandings(
      ['a', 'b', 'c'],
      [played('a', 'b', [2, 1])],
      ['c'],
    );
    expect(ranked[0]).toMatchObject({
      playerId: 'c',
      rank: 1,
      matchPoints: 3,
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 2, lost: 0, drawn: 0 },
      gameWinPercent: 100,
      opponentsMatchWinPercent: 33,
    });
    expect(placings(ranked)).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('ranks by match points first, before any tiebreaker', () => {
    // c has the better tiebreakers, but a has the match points.
    const [a, c] = swissStandings(
      ['b', 'c', 'a'],
      [played('a', 'c', [2, 0])],
      [],
    );
    expect(a).toMatchObject({ playerId: 'a', opponentsMatchWinPercent: 33 });
    expect(c).toMatchObject({ playerId: 'c', opponentsMatchWinPercent: 100 });
  });

  it('ignores a match that hasn’t been reported', () => {
    const ranked = swissStandings(
      ['a', 'b', 'c', 'd'],
      [played('a', 'b', [2, 0]), { players: ['c', 'd'], outcome: null }],
      [],
    );
    expect(standingFor(ranked, 'c')).toMatchObject({
      matchPoints: 0,
      matches: { won: 0, lost: 0, drawn: 0 },
      opponentsMatchWinPercent: 33,
    });
    expect(placings(ranked)).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 3],
    ]);
  });

  it("ranks players level on match points by opponents' match-win % before game-win %", () => {
    // c and d have 1 match point each. c met d (1/6, floored to 33%) and a
    // (100%); d met c (33%) and b (50%). d has the better game-win %.
    const matches = [
      played('a', 'b', [2, 0]),
      grantedDraw('c', 'd'),
      played('a', 'c', [2, 0]),
      played('b', 'd', [2, 1]),
    ];
    const ranked = swissStandings(['a', 'b', 'd', 'c'], matches, []);
    const c = standingFor(ranked, 'c');
    const d = standingFor(ranked, 'd');
    expect(c.opponentsMatchWinPercent).toBeCloseTo(66.5);
    expect(d.opponentsMatchWinPercent).toBeCloseTo(41.5);
    expect(d.gameWinPercent).toBeGreaterThan(c.gameWinPercent);
    expect(placings(ranked)).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('then by game-win %, from game points: 3 a game won, 1 a game drawn', () => {
    // b and c have 3 match points and the same opponents. b won 2 games and
    // lost 3 (6 of 15 game points); c won 2 and lost 2 (6 of 12).
    const matches = [
      played('a', 'b', [2, 0]),
      played('c', 'd', [2, 0]),
      played('a', 'c', [2, 0]),
      played('b', 'd', [2, 1]),
    ];
    const ranked = swissStandings(['a', 'b', 'c', 'd'], matches, []);
    expect(
      ranked.map(({ playerId, gameWinPercent }) => [playerId, gameWinPercent]),
    ).toEqual([
      ['a', 100],
      ['c', 50],
      ['b', 40],
      ['d', 33],
    ]);
    expect(
      swissStandings(['a', 'b'], [played('a', 'b', [2, 0], 1)], [])[0]
        .gameWinPercent,
    ).toBeCloseTo((100 * 7) / 9);
  });

  it("then by opponents' game-win %", () => {
    // x and y have 4 match points, a 66.7% game-win % and a 58.3%
    // opponents' match-win % each. x's opponents won 60% and 66.7% of their
    // game points; y's won 50% and 66.7%.
    const matches = [
      played('x', 'p', [2, 1]),
      played('y', 'q', [2, 1]),
      played('r', 's', [2, 0]),
      grantedDraw('x', 'y'),
      played('p', 'r', [2, 0]),
      played('q', 's', [2, 1]),
    ];
    const [first, second] = swissStandings(
      ['y', 'x', 'p', 'q', 'r', 's'],
      matches,
      [],
    );
    expect([first.playerId, second.playerId]).toEqual(['x', 'y']);
    expect(first.opponentsMatchWinPercent).toBeCloseTo(
      second.opponentsMatchWinPercent!,
    );
    expect(first.gameWinPercent).toBeCloseTo(second.gameWinPercent);
    expect(first.opponentsGameWinPercent).toBeCloseTo(63.33, 1);
    expect(second.opponentsGameWinPercent).toBeCloseTo(58.33, 1);
    expect(second.rank).toBe(2);
  });

  it("counts a draw with a drawn game in an opponent's tiebreakers: 1 match point for the draw, 1 game point for the drawn game", () => {
    // a drew b 1–1 with a drawn game, then beat d 2–0: 4 of 6 match points
    // (66.7%) and 10 of 15 game points (66.7%). c beat d 2–1 and b 2–0: 100%
    // and 12 of 15 game points (80%). So d met a and c: opponents' match-win
    // % (66.7 + 100) / 2 = 83.3, opponents' game-win % (66.7 + 80) / 2 = 73.3.
    const matches = [
      played('a', 'b', [1, 1], 1),
      played('c', 'd', [2, 1]),
      played('a', 'd', [2, 0]),
      played('c', 'b', [2, 0]),
    ];
    const ranked = swissStandings(['a', 'b', 'c', 'd'], matches, []);
    const d = standingFor(ranked, 'd');
    expect(d.opponentsMatchWinPercent).toBeCloseTo(83.3, 1);
    expect(d.opponentsGameWinPercent).toBeCloseTo(73.3, 1);
  });

  it("leaves byes out of opponents' percentages, but not out of the bye's player's own", () => {
    // a had a bye, then beat c; b beat c, then had a bye.
    const ranked = swissStandings(
      ['a', 'b', 'c'],
      [played('b', 'c', [2, 0]), played('a', 'c', [2, 0])],
      ['a', 'b'],
    );
    const a = standingFor(ranked, 'a');
    const c = standingFor(ranked, 'c');
    expect(a).toMatchObject({
      gameWinPercent: 100,
      opponentsMatchWinPercent: 33,
      opponentsGameWinPercent: 33,
    });
    expect(c).toMatchObject({
      opponentsMatchWinPercent: 100,
      opponentsGameWinPercent: 100,
    });
  });

  it('measures a player who stopped playing over the tournament rounds they played', () => {
    // d beat a in tournament round 1 and played no more; a beat c in
    // tournament round 2.
    const ranked = swissStandings(
      ['a', 'b', 'c', 'd'],
      [
        played('d', 'a', [2, 0]),
        played('b', 'c', [2, 0]),
        played('a', 'c', [2, 0]),
      ],
      ['b'],
    );
    const a = standingFor(ranked, 'a');
    // d's 100% over one tournament round, not 50% over two; c's 0% floored to 33%.
    expect(a.opponentsMatchWinPercent).toBeCloseTo(66.5);
  });

  it('shares a place only between players level on every tiebreaker', () => {
    const level = [
      played('a', 'b', [2, 0]),
      played('c', 'd', [2, 0]),
      played('a', 'c', [2, 0]),
      played('b', 'd', [2, 0]),
    ];
    expect(placings(swissStandings(['a', 'b', 'c', 'd'], level, []))).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
    ]);
    const levelOnPoints = [...level.slice(0, 3), played('b', 'd', [2, 1])];
    expect(
      placings(swissStandings(['a', 'b', 'c', 'd'], levelOnPoints, [])),
    ).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 3],
      ['d', 4],
    ]);
  });

  it('counts two percentages that differ only by floating-point noise as equal', () => {
    // a and h have 1 match point and level percentages but for opponents'
    // game-win %. a's opponents, e and f, won 55.6% of their game points
    // each; h's, g and d, won 44.4% and 66.7%. Both average 55.6%, but the
    // two sums differ in their last bit.
    const matches = [
      played('h', 'g', [1, 1], 1),
      played('e', 'c', [2, 1]),
      played('f', 'a', [2, 1]),
      played('b', 'd', [1, 2]),
      played('b', 'c', [1, 2]),
      played('f', 'g', [1, 1], 1),
      played('a', 'e', [1, 1], 1),
      played('d', 'h', [2, 1]),
    ];
    const ranked = swissStandings(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      matches,
      [],
    );
    const a = standingFor(ranked, 'a');
    const h = standingFor(ranked, 'h');
    expect(a.opponentsGameWinPercent).not.toBe(h.opponentsGameWinPercent);
    expect(a.opponentsGameWinPercent).toBeCloseTo(h.opponentsGameWinPercent!);
    expect(h.rank).toBe(a.rank);
  });

  it('floors each percentage at 33%, even before a player has played a game or met an opponent', () => {
    // a has only had a bye; b and c have only a granted draw, with no games,
    // which is 1 of 3 match points: 33.3%, above the floor.
    const ranked = swissStandings(
      ['a', 'b', 'c'],
      [grantedDraw('b', 'c')],
      ['a'],
    );
    expect(standingFor(ranked, 'a')).toMatchObject({
      gameWinPercent: 100,
      opponentsMatchWinPercent: 33,
      opponentsGameWinPercent: 33,
    });
    expect(standingFor(ranked, 'b')).toMatchObject({
      gameWinPercent: 33,
      opponentsMatchWinPercent: expect.closeTo(100 / 3),
      opponentsGameWinPercent: 33,
    });
    expect(swissStandings(['a', 'b'], [], [])[0]).toMatchObject({
      rank: 1,
      gameWinPercent: 33,
      opponentsMatchWinPercent: 33,
      opponentsGameWinPercent: 33,
    });
  });
});

/** The standing of the player `playerId` in `standings`. */
function standingFor(standings: Standing[], playerId: string): Standing {
  return standings.find((standing) => standing.playerId === playerId)!;
}

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
