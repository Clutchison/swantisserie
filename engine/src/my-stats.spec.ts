import { describe, expect, it } from 'vitest';
import { myStats, type StatsTournament } from './my-stats.js';

const gameScore = (games: [number, number], draws = 0) =>
  ({ kind: 'GameScore', games, draws }) as const;

const tally = (won: number, lost: number, drawn = 0) => ({ won, lost, drawn });

/**
 * A complete tournament: its final standings as player ids by rank, each
 * with their standings record from `records` (none if absent), its matches
 * and trophy holders.
 */
function tournament(
  id: string,
  ranks: Record<string, number>,
  matches: StatsTournament['matches'],
  trophyHolders = Object.keys(ranks).filter(
    (playerId) => ranks[playerId] === 1,
  ),
  records: Record<string, ReturnType<typeof tally>> = {},
): StatsTournament & { id: string } {
  return {
    id,
    standings: Object.entries(ranks).map(([playerId, rank]) => ({
      playerId,
      rank,
      matches: records[playerId] ?? tally(0, 0),
    })),
    matches,
    trophyHolders,
  };
}

describe('myStats', () => {
  it('counts tournaments played, trophies and match and game records over the player’s tournaments', () => {
    const tournaments = [
      tournament('t1', { a: 1, b: 2, c: 3 }, [
        { players: ['a', 'b'], outcome: gameScore([2, 1]) },
        { players: ['c', 'a'], outcome: gameScore([0, 2]) },
        { players: ['b', 'c'], outcome: gameScore([1, 1], 1) },
      ]),
      tournament('t2', { b: 1, a: 2 }, [
        { players: ['b', 'a'], outcome: gameScore([2, 1]) },
      ]),
      tournament('t3', { b: 1, c: 2 }, [
        { players: ['b', 'c'], outcome: gameScore([2, 0]) },
      ]),
    ];

    const stats = myStats('a', tournaments);

    expect(stats).toMatchObject({
      tournamentsPlayed: 2,
      trophies: 1,
      trophyRate: 50,
      matches: tally(2, 1),
      games: tally(5, 3),
      bestFinish: { rank: 1, shared: false },
    });
    expect(stats.matchWinRate).toBeCloseTo(66.67, 2);
    expect(stats.gameWinRate).toBeCloseTo(62.5, 2);
  });

  it('gives a result for each tournament the player joined, in the order given, with their standings record', () => {
    const tournaments = [
      // a's bye counts in their standings record as a won match.
      tournament(
        't1',
        { a: 1, b: 2 },
        [{ players: ['a', 'b'], outcome: gameScore([2, 0]) }],
        ['a'],
        { a: tally(2, 0), b: tally(0, 1) },
      ),
      tournament('t2', { b: 1, c: 2 }, [
        { players: ['b', 'c'], outcome: gameScore([2, 0]) },
      ]),
      tournament(
        't3',
        { b: 1, a: 2 },
        [{ players: ['b', 'a'], outcome: gameScore([2, 1]) }],
        ['b'],
        { b: tally(1, 0), a: tally(0, 1) },
      ),
    ];

    const { results, matches } = myStats('a', tournaments);

    expect(matches).toEqual(tally(1, 1));
    expect(results).toEqual([
      {
        tournament: tournaments[0],
        place: { rank: 1, shared: false },
        matches: tally(2, 0),
        trophy: true,
      },
      {
        tournament: tournaments[2],
        place: { rank: 2, shared: false },
        matches: tally(0, 1),
        trophy: false,
      },
    ]);
  });

  it('marks a shared place as shared, and counts a shared trophy as a whole one', () => {
    const tournaments = [
      tournament('t1', { a: 1, b: 1, c: 3 }, [
        { players: ['a', 'b'], outcome: gameScore([1, 1], 1) },
        { players: ['a', 'c'], outcome: gameScore([2, 0]) },
        { players: ['b', 'c'], outcome: gameScore([2, 0]) },
      ]),
      tournament('t2', { c: 1, a: 2, b: 2 }, []),
    ];

    const stats = myStats('a', tournaments);

    expect(stats.trophies).toBe(1);
    expect(stats.trophyRate).toBe(50);
    expect(
      stats.results.map(({ place, trophy }) => ({ place, trophy })),
    ).toEqual([
      { place: { rank: 1, shared: true }, trophy: true },
      { place: { rank: 2, shared: true }, trophy: false },
    ]);
    expect(stats.bestFinish).toEqual({ rank: 1, shared: true });
  });

  it('gives as best finish the highest place, preferring one not shared at the same place', () => {
    const tournaments = [
      tournament('t1', { b: 1, a: 3, c: 3 }, []),
      tournament('t2', { b: 1, a: 2, c: 2 }, []),
      tournament('t3', { b: 1, a: 2, c: 3 }, []),
      tournament('t4', { b: 1, c: 2, a: 2 }, []),
    ];

    expect(myStats('a', tournaments).bestFinish).toEqual({
      rank: 2,
      shared: false,
    });
  });

  it('counts played matches only in its records: forfeits, granted draws, granted wins and unreported matches count for nothing', () => {
    const tournaments = [
      tournament(
        't1',
        { a: 1, b: 2, c: 3 },
        [
          { players: ['a', 'b'], outcome: gameScore([2, 0]) },
          {
            players: ['a', 'c'],
            outcome: { kind: 'Forfeit', forfeitedBy: 'c' },
          },
          { players: ['b', 'a'], outcome: { kind: 'GrantedDraw' } },
          { players: ['c', 'a'], outcome: { kind: 'GrantedWin', winner: 'a' } },
          { players: ['a', 'b'], outcome: null },
        ],
        ['a'],
        { a: tally(3, 0, 1) },
      ),
    ];

    const stats = myStats('a', tournaments);

    expect(stats.matches).toEqual(tally(1, 0));
    expect(stats.games).toEqual(tally(2, 0));
    // The result's record is the standings', which count them all.
    expect(stats.results[0].matches).toEqual(tally(3, 0, 1));
  });

  it('keeps a dropped player’s played matches and place', () => {
    // c dropped after losing to a; their remaining match with b was a forfeit.
    const tournaments = [
      tournament('t1', { a: 1, b: 2, c: 3 }, [
        { players: ['a', 'c'], outcome: gameScore([2, 1]) },
        { players: ['b', 'c'], outcome: { kind: 'Forfeit', forfeitedBy: 'c' } },
        { players: ['a', 'b'], outcome: gameScore([2, 0]) },
      ]),
    ];

    const stats = myStats('c', tournaments);

    expect(stats.tournamentsPlayed).toBe(1);
    expect(stats.matches).toEqual(tally(0, 1));
    expect(stats.games).toEqual(tally(1, 2));
    expect(stats.results[0].place).toEqual({ rank: 3, shared: false });
  });

  it('gives no win rate over no played match, as when a player had only a bye before dropping', () => {
    // Byes are left out of the matches: b's only round was a bye.
    const tournaments = [tournament('t1', { a: 1, b: 2 }, [], ['a'])];

    const stats = myStats('b', tournaments);

    expect(stats).toMatchObject({
      tournamentsPlayed: 1,
      trophies: 0,
      trophyRate: 0,
      matches: tally(0, 0),
      matchWinRate: null,
      games: tally(0, 0),
      gameWinRate: null,
      bestFinish: { rank: 2, shared: false },
    });
  });

  it('gives nothing for a player who joined no complete tournament', () => {
    const tournaments = [tournament('t1', { a: 1, b: 2 }, [])];

    expect(myStats('z', tournaments)).toEqual({
      tournamentsPlayed: 0,
      trophies: 0,
      trophyRate: null,
      matches: tally(0, 0),
      matchWinRate: null,
      games: tally(0, 0),
      gameWinRate: null,
      bestFinish: null,
      results: [],
    });
  });
});
