import { describe, expect, it } from 'vitest';
import {
  GAME_SCORES,
  reportProblem,
  roundRobinSchedule,
  standings,
  swissStandings,
  trophyHolders,
  type Standing,
  type TournamentMatch,
} from './tournament.js';

/** Player ids p1, p2, … in order. */
function players(count: number) {
  return Array.from({ length: count }, (_, i) => `p${i + 1}`);
}

/** A match `a` and `b` played to the game score `games`, `a`'s games first. */
function played(
  a: string,
  b: string,
  games: [number, number],
  draws = 0,
): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'GameScore', games, draws } };
}

function granted(a: string, b: string): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'GrantedDraw' } };
}

function forfeited(a: string, b: string, forfeitedBy: string): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'Forfeit', forfeitedBy } };
}

/** Each standing's player and rank, in standings order. */
function ranks(players: string[], matches: TournamentMatch[]) {
  return placings(standings(players, matches));
}

/** Each standing's player and rank, in the order of `table`. */
function placings(table: Standing[]) {
  return table.map(({ playerId, rank }) => [playerId, rank]);
}

/** The standing of the player `playerId` in `table`. */
function standingFor(table: Standing[], playerId: string): Standing {
  return table.find((standing) => standing.playerId === playerId)!;
}

describe('roundRobinSchedule', () => {
  it('pairs two players once, in one tournament round', () => {
    expect(roundRobinSchedule(['a', 'b'])).toEqual([
      { matches: [['a', 'b']], bye: null },
    ]);
  });

  it('gives each of three players one bye across three tournament rounds', () => {
    const rounds = roundRobinSchedule(['a', 'b', 'c']);
    expect(rounds).toHaveLength(3);
    expect(new Set(rounds.map((round) => round.bye))).toEqual(
      new Set(['a', 'b', 'c']),
    );
    expect(rounds.every((round) => round.matches.length === 1)).toBe(true);
  });

  it.each(Array.from({ length: 11 }, (_, i) => i + 2))(
    'has each pair of %i players meet exactly once, each playing at most once a tournament round',
    (count) => {
      const ids = players(count);
      const rounds = roundRobinSchedule(ids);
      const pairs = rounds.flatMap((round) =>
        round.matches.map((match) => [...match].sort().join()),
      );
      const expected = ids.flatMap((a, i) =>
        ids.slice(i + 1).map((b) => [a, b].sort().join()),
      );

      expect(pairs.sort()).toEqual(expected.sort());
      expect(rounds).toHaveLength(count % 2 === 0 ? count - 1 : count);
      for (const round of rounds) {
        const seated = [
          ...round.matches.flat(),
          ...(round.bye ? [round.bye] : []),
        ];
        expect(seated.sort()).toEqual([...ids].sort());
      }
    },
  );

  it.each([3, 5, 7, 9, 11])(
    'gives each of %i players exactly one bye',
    (count) => {
      const byes = roundRobinSchedule(players(count)).map((round) => round.bye);
      expect(new Set(byes)).toEqual(new Set(players(count)));
      expect(byes).toHaveLength(count);
    },
  );

  it.each([2, 4, 6, 8, 10, 12])('gives %i players no byes', (count) => {
    expect(
      roundRobinSchedule(players(count)).every((round) => round.bye === null),
    ).toBe(true);
  });
});

describe('standings', () => {
  it('scores 3 match points a win, 1 a draw and 0 a loss, and counts matches and games', () => {
    expect(standings(['a', 'b'], [played('a', 'b', [2, 1])])).toEqual([
      {
        playerId: 'a',
        rank: 1,
        matchPoints: 3,
        matches: { won: 1, lost: 0, drawn: 0 },
        games: { won: 2, lost: 1, drawn: 0 },
        gameWinPercent: 200 / 3,
      },
      {
        playerId: 'b',
        rank: 2,
        matchPoints: 0,
        matches: { won: 0, lost: 1, drawn: 0 },
        games: { won: 1, lost: 2, drawn: 0 },
        gameWinPercent: 100 / 3,
      },
    ]);
    expect(
      standings(['a', 'b'], [played('a', 'b', [1, 1], 1)])[0],
    ).toMatchObject({
      matchPoints: 1,
      matches: { won: 0, lost: 0, drawn: 1 },
      games: { won: 1, lost: 1, drawn: 1 },
    });
  });

  it('ranks by match points first', () => {
    const matches = [
      played('c', 'b', [2, 0]),
      played('b', 'a', [2, 1]),
      played('c', 'a', [2, 1]),
    ];
    expect(ranks(['a', 'b', 'c'], matches)).toEqual([
      ['c', 1],
      ['b', 2],
      ['a', 3],
    ]);
  });

  it('ignores matches not yet reported', () => {
    expect(ranks(['a', 'b'], [{ players: ['a', 'b'], outcome: null }])).toEqual(
      [
        ['a', 1],
        ['b', 1],
      ],
    );
  });

  it('breaks a two-way tie by head-to-head before game-win %', () => {
    // a and b both have 6 match points; b has the better game-win %, but a beat b.
    const matches = [
      played('a', 'b', [2, 1]),
      played('a', 'c', [2, 1]),
      played('d', 'a', [2, 1]),
      played('b', 'c', [2, 0]),
      played('b', 'd', [2, 0]),
      played('c', 'd', [2, 0]),
    ];
    expect(ranks(['a', 'b', 'c', 'd'], matches)).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('breaks a three-way tie by the match points among the tied players only', () => {
    // e leads on 7. a, b and c have 6 each: among themselves a has 6, b 3 and c 0,
    // though their game-win % runs the other way.
    const matches = [
      played('a', 'b', [2, 1]),
      played('a', 'c', [2, 1]),
      played('d', 'a', [2, 0]),
      played('e', 'a', [2, 0]),
      played('b', 'c', [2, 1]),
      played('b', 'd', [2, 0]),
      played('e', 'b', [2, 0]),
      played('c', 'd', [2, 0]),
      played('c', 'e', [2, 0]),
      played('d', 'e', [1, 1], 1),
    ];
    expect(ranks(['a', 'b', 'c', 'd', 'e'], matches)).toEqual([
      ['e', 1],
      ['a', 2],
      ['b', 3],
      ['c', 4],
      ['d', 5],
    ]);
  });

  it('falls back to game-win % when head-to-head leaves a tie', () => {
    // Each beat one of the others: 3 match points each, 3 among themselves.
    const matches = [
      played('a', 'b', [2, 1]),
      played('b', 'c', [2, 0]),
      played('c', 'a', [2, 0]),
    ];
    expect(ranks(['a', 'b', 'c'], matches)).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('shares a rank between players still tied after every tiebreaker, keeping their order', () => {
    const matches = [
      played('a', 'b', [2, 0]),
      played('a', 'c', [2, 0]),
      granted('b', 'c'),
    ];
    expect(ranks(['a', 'b', 'c'], matches)).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
    ]);
    expect(
      ranks(
        ['a', 'b', 'c', 'd'],
        [granted('a', 'b'), played('c', 'd', [2, 0])],
      ),
    ).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 2],
      ['d', 4],
    ]);
  });

  it('counts a granted draw as a drawn match with no games', () => {
    expect(standings(['a', 'b'], [granted('a', 'b')])).toEqual(
      ['a', 'b'].map((playerId) => ({
        playerId,
        rank: 1,
        matchPoints: 1,
        matches: { won: 0, lost: 0, drawn: 1 },
        games: { won: 0, lost: 0, drawn: 0 },
        gameWinPercent: 0,
      })),
    );
  });

  it('counts a forfeit as a won match for the other player, with no games', () => {
    const [first, second] = standings(['a', 'b'], [forfeited('a', 'b', 'a')]);
    expect(first).toMatchObject({
      playerId: 'b',
      rank: 1,
      matchPoints: 3,
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 0, lost: 0, drawn: 0 },
    });
    expect(second).toMatchObject({
      playerId: 'a',
      rank: 2,
      matchPoints: 0,
      matches: { won: 0, lost: 1, drawn: 0 },
    });
  });
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

  it("ranks players level on match points by opponents' match-win % before game-win %", () => {
    // c and d have 1 match point each. c met d (1/6, floored to 33%) and a
    // (100%); d met c (33%) and b (50%). d has the better game-win %.
    const matches = [
      played('a', 'b', [2, 0]),
      granted('c', 'd'),
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
      granted('x', 'y'),
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

  it('floors each percentage at 33%', () => {
    const [winner, loser] = swissStandings(
      ['a', 'b'],
      [played('a', 'b', [2, 0])],
      [],
    );
    expect(winner).toMatchObject({
      playerId: 'a',
      gameWinPercent: 100,
      opponentsMatchWinPercent: 33,
      opponentsGameWinPercent: 33,
    });
    expect(loser).toMatchObject({
      playerId: 'b',
      gameWinPercent: 33,
      opponentsMatchWinPercent: 100,
      opponentsGameWinPercent: 100,
    });
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

  it('floors at 33% even before a player has played a game or met an opponent', () => {
    // a has only had a bye; b and c have only a granted draw, with no games,
    // which is 1 of 3 match points: 33.3%, above the floor.
    const ranked = swissStandings(['a', 'b', 'c'], [granted('b', 'c')], ['a']);
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

describe('GAME_SCORES', () => {
  it('lists the game scores a best-of-three match ends at, each of which can be reported', () => {
    expect(GAME_SCORES).toEqual([
      [2, 0],
      [2, 1],
      [1, 2],
      [0, 2],
    ]);
    for (const games of GAME_SCORES) expect(reportProblem(games)).toBeNull();
  });
});

describe('reportProblem', () => {
  it.each([
    [2, 0],
    [2, 1],
    [1, 2],
    [0, 2],
  ])('accepts %i–%i', (a, b) => {
    expect(reportProblem([a, b])).toBeNull();
  });

  it.each([
    [1, 1],
    [0, 0],
  ])('refuses the draw %i–%i', (a, b) => {
    expect(reportProblem([a, b])?.error).toBe('draw');
  });

  it.each([
    [3, 0],
    [1, 0],
    [0, 3],
    [3, 1],
  ])('refuses %i–%i, which a best-of-three match never ends at', (a, b) => {
    expect(reportProblem([a, b])?.error).toBe('not-best-of-three');
  });
});

describe('trophyHolders', () => {
  it('is the player ranked first', () => {
    expect(
      trophyHolders(standings(['a', 'b'], [played('b', 'a', [2, 0])])),
    ).toEqual(['b']);
  });

  it('is everyone who shares first', () => {
    const matches = [
      granted('a', 'b'),
      played('a', 'c', [2, 0]),
      played('b', 'c', [2, 0]),
    ];
    expect(trophyHolders(standings(['a', 'b', 'c'], matches))).toEqual([
      'a',
      'b',
    ]);
  });
});
