import { describe, expect, it } from 'vitest';
import {
  bracketRounds,
  firstBracketRound,
  nextBracketRound,
  singleEliminationRoundCount,
  singleEliminationStandings,
  winnerOf,
} from './single-elimination.js';
import type { DecidedMatch, Standing, TournamentMatch } from './tournament.js';

/** Seed order s1, s2, … sN: each player is named after their seed. */
function seeds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `s${i + 1}`);
}

describe('singleEliminationRoundCount', () => {
  it('plays ⌈log₂ joined players⌉ tournament rounds', () => {
    const counts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
      singleEliminationRoundCount,
    );
    expect(counts).toEqual([1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
  });
});

describe('firstBracketRound', () => {
  it('pairs 8 players in the standard seed layout', () => {
    expect(firstBracketRound(seeds(8))).toEqual([
      { bracketPlace: 0, players: ['s1', 's8'] },
      { bracketPlace: 1, players: ['s4', 's5'] },
      { bracketPlace: 2, players: ['s2', 's7'] },
      { bracketPlace: 3, players: ['s3', 's6'] },
    ]);
  });

  it('gives the top seeds the byes that fill the bracket to the next power of two', () => {
    expect(firstBracketRound(seeds(5))).toEqual([
      { bracketPlace: 0, players: ['s1', null] },
      { bracketPlace: 1, players: ['s4', 's5'] },
      { bracketPlace: 2, players: ['s2', null] },
      { bracketPlace: 3, players: ['s3', null] },
    ]);
  });

  it('pairs 2 players in one match', () => {
    expect(firstBracketRound(seeds(2))).toEqual([
      { bracketPlace: 0, players: ['s1', 's2'] },
    ]);
  });

  it.each([
    [2, 2, 0],
    [3, 4, 1],
    [4, 4, 0],
    [5, 8, 3],
    [6, 8, 2],
    [7, 8, 1],
    [8, 8, 0],
    [9, 16, 7],
    [10, 16, 6],
    [11, 16, 5],
    [12, 16, 4],
  ])(
    'sizes a bracket of %i players to %i, with %i byes for the top seeds',
    (players, size, byes) => {
      const round = firstBracketRound(seeds(players));
      expect(round).toHaveLength(size / 2);
      expect(round.map((match) => match.bracketPlace)).toEqual(
        round.map((_, i) => i),
      );
      const withByes = round
        .filter((match) => match.players[1] === null)
        .map((match) => match.players[0]);
      expect(new Set(withByes)).toEqual(new Set(seeds(byes)));
      const placed = round.flatMap((match) => match.players);
      expect(new Set(placed.filter((id) => id !== null))).toEqual(
        new Set(seeds(players)),
      );
      expect(placed).toHaveLength(players + byes);
    },
  );

  it('keeps seeds 1 and 2 in opposite halves, so they can meet only in the final', () => {
    for (const players of [4, 7, 12]) {
      const round = firstBracketRound(seeds(players));
      const half = round.length / 2;
      const placeOf = (seed: string) =>
        round.findIndex((match) => match.players.includes(seed));
      expect(placeOf('s1')).toBeLessThan(half);
      expect(placeOf('s2')).toBeGreaterThanOrEqual(half);
    }
  });
});

describe('nextBracketRound', () => {
  it('pairs the winners of neighbouring bracket places', () => {
    expect(nextBracketRound(['s1', 's5', 's2', 's3'])).toEqual([
      { bracketPlace: 0, players: ['s1', 's5'] },
      { bracketPlace: 1, players: ['s2', 's3'] },
    ]);
  });

  it('reaches the final from 6 players', () => {
    const first = firstBracketRound(seeds(6));
    const second = nextBracketRound(
      first.map(({ players: [a, b] }) => (b === 's6' ? b : a)),
    );
    expect(second).toEqual([
      { bracketPlace: 0, players: ['s1', 's4'] },
      { bracketPlace: 1, players: ['s2', 's6'] },
    ]);
    expect(nextBracketRound(['s4', 's2'])).toEqual([
      { bracketPlace: 0, players: ['s4', 's2'] },
    ]);
  });
});

/** A match the first player won 2–0. */
function won(a: string, b: string): TournamentMatch {
  return {
    players: [a, b],
    outcome: { kind: 'GameScore', games: [2, 0], draws: 0 },
  };
}

describe('singleEliminationStandings', () => {
  // s1, s2 and s3 had byes; s4 beat s5, then s1 beat s4 and s3 beat s2.
  const reached = [won('s4', 's5'), won('s1', 's4'), won('s3', 's2')];
  const final: TournamentMatch = {
    players: ['s1', 's3'],
    outcome: { kind: 'GrantedWin', winner: 's3' },
  };
  const byes = ['s1', 's2', 's3'];
  const ranks = (table: Standing[]) =>
    table.map(({ playerId, rank }) => [playerId, rank]);

  it('ranks players by the tournament round they reached, sharing a rank within it', () => {
    expect(ranks(singleEliminationStandings(seeds(5), reached, byes))).toEqual([
      ['s1', 1],
      ['s3', 1],
      ['s2', 3],
      ['s4', 3],
      ['s5', 5],
    ]);
  });

  it('ranks the winner of the final alone first', () => {
    const table = singleEliminationStandings(
      seeds(5),
      [...reached, final],
      byes,
    );
    expect(ranks(table)).toEqual([
      ['s3', 1],
      ['s1', 2],
      ['s2', 3],
      ['s4', 3],
      ['s5', 5],
    ]);
  });

  it('counts a granted win as a won match with no games', () => {
    const [winner] = singleEliminationStandings(
      ['a', 'b'],
      [{ players: ['a', 'b'], outcome: { kind: 'GrantedWin', winner: 'b' } }],
      [],
    );
    expect(winner).toMatchObject({
      playerId: 'b',
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 0, lost: 0, drawn: 0 },
    });
  });

  it('leaves unreported matches out', () => {
    const table = singleEliminationStandings(
      ['a', 'b'],
      [{ players: ['a', 'b'], outcome: null }],
      [],
    );
    expect(ranks(table)).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });
});

describe('winnerOf', () => {
  it.each<[string, DecidedMatch['outcome'], string | null]>([
    [
      'the player with more games',
      { kind: 'GameScore', games: [1, 2], draws: 0 },
      'b',
    ],
    [
      'the opponent of the player who forfeited',
      { kind: 'Forfeit', forfeitedBy: 'a' },
      'b',
    ],
    ['the player granted the win', { kind: 'GrantedWin', winner: 'a' }, 'a'],
    ['nobody for a granted draw', { kind: 'GrantedDraw' }, null],
  ])('is %s', (_, outcome, winner) => {
    expect(winnerOf({ players: ['a', 'b'], outcome })).toBe(winner);
  });
});

describe('bracketRounds', () => {
  const player = (playerId: string) => ({ kind: 'Player', playerId }) as const;
  const winnerOfPlace = (bracketPlace: number) =>
    ({ kind: 'WinnerOf', bracketPlace }) as const;
  const bye = { kind: 'Bye' } as const;

  it('draws every tournament round, the unpaired ones fed by the bracket places before them', () => {
    // 3 players: s1 has a bye, s2 plays s3, unreported.
    expect(
      bracketRounds(2, [
        { round: 1, bracketPlace: 0, players: ['s1', null], winner: 's1' },
        { round: 1, bracketPlace: 1, players: ['s2', 's3'], winner: null },
      ]),
    ).toEqual([
      {
        round: 1,
        places: [
          { bracketPlace: 0, sides: [player('s1'), bye], winner: 's1' },
          {
            bracketPlace: 1,
            sides: [player('s2'), player('s3')],
            winner: null,
          },
        ],
      },
      {
        round: 2,
        places: [
          {
            bracketPlace: 0,
            sides: [player('s1'), winnerOfPlace(1)],
            winner: null,
          },
        ],
      },
    ]);
  });

  it('puts a match’s winner in the next bracket place before that round is paired, and leaves later ones to the winners of the places feeding them', () => {
    // 8 players: s1, s5 and s3 have won; s2 v s7 is unreported.
    const rounds = bracketRounds(3, [
      { round: 1, bracketPlace: 0, players: ['s1', 's8'], winner: 's1' },
      { round: 1, bracketPlace: 1, players: ['s4', 's5'], winner: 's5' },
      { round: 1, bracketPlace: 2, players: ['s2', 's7'], winner: null },
      { round: 1, bracketPlace: 3, players: ['s3', 's6'], winner: 's3' },
    ]);
    expect(rounds.slice(1)).toEqual([
      {
        round: 2,
        places: [
          {
            bracketPlace: 0,
            sides: [player('s1'), player('s5')],
            winner: null,
          },
          {
            bracketPlace: 1,
            sides: [winnerOfPlace(2), player('s3')],
            winner: null,
          },
        ],
      },
      {
        round: 3,
        places: [
          {
            bracketPlace: 0,
            sides: [winnerOfPlace(0), winnerOfPlace(1)],
            winner: null,
          },
        ],
      },
    ]);
  });

  it('draws a paired tournament round as it was paired', () => {
    const rounds = bracketRounds(2, [
      { round: 1, bracketPlace: 0, players: ['s1', 's4'], winner: 's1' },
      { round: 1, bracketPlace: 1, players: ['s2', 's3'], winner: 's3' },
      { round: 2, bracketPlace: 0, players: ['s1', 's3'], winner: 's3' },
    ]);
    expect(rounds[1]).toEqual({
      round: 2,
      places: [
        { bracketPlace: 0, sides: [player('s1'), player('s3')], winner: 's3' },
      ],
    });
  });
});
