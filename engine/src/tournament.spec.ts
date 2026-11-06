import { describe, expect, it } from 'vitest';
import {
  droppedPlayers,
  GAME_SCORES,
  reportProblem,
  roundCompletion,
  roundRobinMatches,
  standings,
  trophyHolders,
  type MatchOutcome,
  type RoundCompletion,
  type RoundCompletionInput,
  type TournamentMatch,
} from './tournament.js';
import { grantedDraw, placings, played } from './tournament.fixtures.js';
import {
  agreedAdvancingPlayer,
  bracketRounds,
  bracketTrophyHolders,
  type PlayedBracketMatch,
} from './single-elimination.js';

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

function forfeited(a: string, b: string, forfeitedBy: string): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'Forfeit', forfeitedBy } };
}

/** Each standing's player and rank, in standings order. */
function ranks(players: string[], matches: TournamentMatch[]) {
  return placings(standings(players, matches));
}

describe('roundRobinMatches', () => {
  it('has each pair of players meet exactly once, the earlier player first', () => {
    expect(roundRobinMatches(['a', 'b', 'c', 'd'])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['b', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
  });

  it.each([2, 3, 5, 8, 12])(
    'makes n(n−1)/2 matches for %i players, none repeated',
    (n) => {
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      const matches = roundRobinMatches(players);
      expect(matches).toHaveLength((n * (n - 1)) / 2);
      expect(
        new Set(matches.map(([a, b]) => [a, b].sort().join('-'))).size,
      ).toBe(matches.length);
      for (const [a, b] of matches) expect(a).not.toBe(b);
    },
  );
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
      grantedDraw('b', 'c'),
    ];
    expect(ranks(['a', 'b', 'c'], matches)).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
    ]);
    expect(
      ranks(
        ['a', 'b', 'c', 'd'],
        [grantedDraw('a', 'b'), played('c', 'd', [2, 0])],
      ),
    ).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 2],
      ['d', 4],
    ]);
  });

  it('counts a granted draw as a drawn match with no games', () => {
    expect(standings(['a', 'b'], [grantedDraw('a', 'b')])).toEqual(
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
      grantedDraw('a', 'b'),
      played('a', 'c', [2, 0]),
      played('b', 'c', [2, 0]),
    ];
    expect(trophyHolders(standings(['a', 'b', 'c'], matches))).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('roundCompletion', () => {
  /** Entries for `players`, those in `dropped` dropped. */
  const entries = (players: string[], dropped: string[] = []) =>
    players.map((playerId) => ({
      playerId,
      dropped: dropped.includes(playerId),
    }));

  describe('in Swiss', () => {
    it('pairs the next round while enough undropped players are left', () => {
      expect(
        roundCompletion({
          format: 'Swiss',
          round: 1,
          roundCount: 3,
          entries: entries(['a', 'b', 'c'], ['c']),
        }),
      ).toEqual({ completes: false });
    });

    it('completes the tournament after the final round, with a trophy holder', () => {
      expect(
        roundCompletion({
          format: 'Swiss',
          round: 3,
          roundCount: 3,
          entries: entries(['a', 'b', 'c']),
        }),
      ).toEqual({ completes: true, reason: 'FinalRound', trophyHolder: true });
    });

    it('completes the tournament when too few undropped players are left', () => {
      expect(
        roundCompletion({
          format: 'Swiss',
          round: 1,
          roundCount: 3,
          entries: entries(['a', 'b', 'c'], ['b', 'c']),
        }),
      ).toEqual({ completes: true, reason: 'TooFewLeft', trophyHolder: true });
    });
  });

  describe('in single elimination', () => {
    const win = (winner: string): MatchOutcome => ({
      kind: 'GrantedWin',
      winner,
    });
    const forfeit = (forfeitedBy: string): MatchOutcome => ({
      kind: 'Forfeit',
      forfeitedBy,
    });
    /** Four players' round 1 of 2, s1 v s4 then s2 v s3, decided by `outcomes`. */
    const semifinals = (
      outcomes: [MatchOutcome, MatchOutcome],
      dropped: string[] = [],
    ) => ({
      format: 'SingleElimination' as const,
      round: 1,
      roundCount: 2,
      entries: entries(['s1', 's2', 's3', 's4'], dropped),
      results: [
        { players: ['s1', 's4'] as const, outcome: outcomes[0] },
        { players: ['s2', 's3'] as const, outcome: outcomes[1] },
      ],
    });
    /** Two players' final, s1 v s2, decided by `outcome`. */
    const final = (outcome: MatchOutcome, dropped: string[] = []) => ({
      format: 'SingleElimination' as const,
      round: 1,
      roundCount: 1,
      entries: entries(['s1', 's2'], dropped),
      results: [{ players: ['s1', 's2'] as const, outcome }],
    });

    const cases: [
      string,
      Extract<RoundCompletionInput, { format: 'SingleElimination' }>,
      RoundCompletion,
    ][] = [
      [
        'pairs the next round while enough players advance',
        semifinals([win('s1'), win('s3')]),
        { completes: false },
      ],
      [
        'completes the tournament after the final, with a trophy holder',
        final(win('s2')),
        { completes: true, reason: 'FinalRound', trophyHolder: true },
      ],
      [
        'completes the tournament after the final with nobody to hold the trophy when both finalists drop',
        final(forfeit('s1'), ['s1', 's2']),
        { completes: true, reason: 'FinalRound', trophyHolder: false },
      ],
      [
        'completes the tournament when one player is left, who holds the trophy',
        semifinals([win('s4'), forfeit('s2')], ['s2', 's3']),
        { completes: true, reason: 'TooFewLeft', trophyHolder: true },
      ],
      [
        'completes the tournament with nobody to hold the trophy when nobody is left',
        semifinals([forfeit('s1'), forfeit('s2')], ['s1', 's2', 's3', 's4']),
        { completes: true, reason: 'TooFewLeft', trophyHolder: false },
      ],
    ];

    it.each(cases)('%s', (_, input, completion) => {
      expect(roundCompletion(input)).toEqual(completion);
    });

    it.each(cases.filter(([, , completion]) => completion.completes))(
      'forecasts the trophy as the complete tournament awards it: %s',
      (_, input, completion) => {
        const dropped = droppedPlayers(input.entries);
        const bracketMatches = input.results.map(
          (result, bracketPlace): PlayedBracketMatch => ({
            round: input.round,
            bracketPlace,
            players: result.players,
            advancing: agreedAdvancingPlayer(
              { ...result, reportedBy: null, confirmed: false },
              dropped,
              true,
            ),
          }),
        );
        const holders = bracketTrophyHolders(
          bracketRounds(input.roundCount, bracketMatches, dropped),
        );
        expect(holders.length > 0).toBe(
          completion.completes && completion.trophyHolder,
        );
      },
    );
  });
});
