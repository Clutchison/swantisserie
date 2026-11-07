import { describe, expect, it } from 'vitest';
import { leaderboard, type LeaderboardTournament } from './leaderboard.js';

const gameScoreOutcome = (games: [number, number], draws = 0) =>
  ({ kind: 'GameScore', games, draws }) as const;

const playerIdsOf = (records: readonly { playerId: string }[]) =>
  records.map((record) => record.playerId);

describe('leaderboard', () => {
  it('counts trophies, tournaments played and match and game records across tournaments', () => {
    const tournaments: LeaderboardTournament[] = [
      {
        players: ['a', 'b', 'c'],
        matches: [
          { players: ['a', 'b'], outcome: gameScoreOutcome([2, 1]) },
          { players: ['a', 'c'], outcome: gameScoreOutcome([2, 0]) },
          { players: ['b', 'c'], outcome: gameScoreOutcome([1, 1], 1) },
        ],
        trophyHolders: ['a'],
      },
      {
        players: ['a', 'b'],
        matches: [{ players: ['b', 'a'], outcome: gameScoreOutcome([2, 0]) }],
        trophyHolders: ['b'],
      },
      {
        players: ['a', 'c'],
        matches: [{ players: ['c', 'a'], outcome: gameScoreOutcome([0, 2]) }],
        trophyHolders: ['a'],
      },
    ];

    expect(leaderboard(tournaments)).toEqual([
      {
        playerId: 'a',
        trophies: 2,
        tournamentsPlayed: 3,
        matches: { won: 3, lost: 1, drawn: 0 },
        games: { won: 6, lost: 3, drawn: 0 },
        opponents: [
          {
            playerId: 'b',
            matches: { won: 1, lost: 1, drawn: 0 },
            games: { won: 2, lost: 3, drawn: 0 },
          },
          {
            playerId: 'c',
            matches: { won: 2, lost: 0, drawn: 0 },
            games: { won: 4, lost: 0, drawn: 0 },
          },
        ],
      },
      {
        playerId: 'b',
        trophies: 1,
        tournamentsPlayed: 2,
        matches: { won: 1, lost: 1, drawn: 1 },
        games: { won: 4, lost: 3, drawn: 1 },
        opponents: [
          {
            playerId: 'a',
            matches: { won: 1, lost: 1, drawn: 0 },
            games: { won: 3, lost: 2, drawn: 0 },
          },
          {
            playerId: 'c',
            matches: { won: 0, lost: 0, drawn: 1 },
            games: { won: 1, lost: 1, drawn: 1 },
          },
        ],
      },
      {
        playerId: 'c',
        trophies: 0,
        tournamentsPlayed: 2,
        matches: { won: 0, lost: 2, drawn: 1 },
        games: { won: 1, lost: 5, drawn: 1 },
        opponents: [
          {
            playerId: 'a',
            matches: { won: 0, lost: 2, drawn: 0 },
            games: { won: 0, lost: 4, drawn: 0 },
          },
          {
            playerId: 'b',
            matches: { won: 0, lost: 0, drawn: 1 },
            games: { won: 1, lost: 1, drawn: 1 },
          },
        ],
      },
    ]);
  });

  it('leaves forfeits, granted draws, granted wins and unreported matches out of records', () => {
    const [a] = leaderboard([
      {
        players: ['a', 'b', 'c', 'd', 'e'],
        matches: [
          { players: ['a', 'b'], outcome: gameScoreOutcome([2, 0]) },
          {
            players: ['a', 'c'],
            outcome: { kind: 'Forfeit', forfeitedBy: 'c' },
          },
          { players: ['a', 'd'], outcome: { kind: 'GrantedDraw' } },
          { players: ['a', 'e'], outcome: { kind: 'GrantedWin', winner: 'a' } },
          { players: ['b', 'e'], outcome: null },
        ],
        trophyHolders: ['a'],
      },
    ]);

    expect(a).toMatchObject({
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 2, lost: 0, drawn: 0 },
      opponents: [{ playerId: 'b' }],
    });
  });

  it('lists only players with a played match', () => {
    const board = leaderboard([
      {
        players: ['a', 'b', 'c'],
        matches: [
          { players: ['a', 'b'], outcome: gameScoreOutcome([2, 0]) },
          {
            players: ['a', 'c'],
            outcome: { kind: 'Forfeit', forfeitedBy: 'c' },
          },
        ],
        trophyHolders: ['a'],
      },
    ]);

    expect(playerIdsOf(board)).toEqual(['a', 'b']);
  });

  it('ranks by trophies, then matches won, ties keeping the order players first appear in', () => {
    const board = leaderboard([
      {
        players: ['a', 'b', 'c', 'd'],
        matches: [
          { players: ['a', 'b'], outcome: gameScoreOutcome([2, 0]) },
          { players: ['c', 'd'], outcome: gameScoreOutcome([2, 0]) },
          { players: ['d', 'b'], outcome: gameScoreOutcome([2, 0]) },
        ],
        trophyHolders: [],
      },
      {
        players: ['b', 'c'],
        matches: [{ players: ['b', 'c'], outcome: gameScoreOutcome([0, 2]) }],
        trophyHolders: ['b', 'c'],
      },
    ]);

    expect(playerIdsOf(board)).toEqual(['c', 'b', 'a', 'd']);
  });

  it("lists each player's head-to-head records in leaderboard order, not the order they were played", () => {
    const trophyTournament = (
      trophyHolders: string[],
    ): LeaderboardTournament => ({
      players: trophyHolders,
      matches: [],
      trophyHolders,
    });
    const board = leaderboard([
      {
        players: ['x', 'a', 'b', 'c', 'd'],
        matches: [
          { players: ['x', 'd'], outcome: gameScoreOutcome([2, 0]) },
          { players: ['c', 'x'], outcome: gameScoreOutcome([2, 0]) },
          { players: ['x', 'b'], outcome: gameScoreOutcome([2, 0]) },
          { players: ['a', 'x'], outcome: gameScoreOutcome([2, 0]) },
        ],
        trophyHolders: [],
      },
      // Trophies: a 3, b 2, c 1, so a, b and c rank above x, who won more matches than d.
      trophyTournament(['a', 'b', 'c']),
      trophyTournament(['a', 'b']),
      trophyTournament(['a']),
    ]);

    expect(playerIdsOf(board)).toEqual(['a', 'b', 'c', 'x', 'd']);
    const x = board.find((entry) => entry.playerId === 'x');
    expect(playerIdsOf(x?.opponents ?? [])).toEqual(['a', 'b', 'c', 'd']);
  });
});
