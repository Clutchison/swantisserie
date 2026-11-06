import { describe, expect, it } from 'vitest';
import {
  droppedPlayers,
  GAME_SCORES,
  reportProblem,
  standings,
  trophyHolders,
  type Standing,
  type TournamentMatch,
} from './tournament.js';

describe('droppedPlayers', () => {
  it('is the players who have dropped, in entry order', () => {
    expect(
      droppedPlayers([
        { playerId: 'a', dropped: true },
        { playerId: 'b', dropped: false },
        { playerId: 'c', dropped: true },
      ]),
    ).toEqual(['a', 'c']);
  });
});

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
