import { describe, expect, it } from 'vitest';
import {
  agreedAdvancingPlayer,
  bracketRounds,
  byesSendingOn,
  countAdvancing,
  dependentBracketPlaces,
  firstBracketRound,
  nextBracketRound,
  singleEliminationRoundCount,
  singleEliminationStandings,
  winnerOf,
  type Advancing,
  type PlayedBracketMatch,
} from './single-elimination.js';
import {
  trophyHolders,
  type DecidedMatch,
  type MatchOutcome,
  type TournamentMatch,
} from './tournament.js';
import { forfeited, placings, won } from './tournament.fixtures.js';

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
  it('gives a bye to the player whose would-be opponents both dropped', () => {
    expect(nextBracketRound(['s1', null, null, 's3'])).toEqual([
      { bracketPlace: 0, players: ['s1', null] },
      { bracketPlace: 1, players: ['s3', null] },
    ]);
  });

  it('leaves a bracket place empty when nobody advances to it', () => {
    expect(nextBracketRound([null, null, 's2', 's3'])).toEqual([
      { bracketPlace: 1, players: ['s2', 's3'] },
    ]);
  });

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

describe('singleEliminationStandings', () => {
  // s1, s2 and s3 had byes; s4 beat s5, then s1 beat s4 and s3 beat s2.
  const reached = [won('s4', 's5'), won('s1', 's4'), won('s3', 's2')];
  const final: TournamentMatch = {
    players: ['s1', 's3'],
    outcome: { kind: 'GrantedWin', winner: 's3' },
  };
  const byes = ['s1', 's2', 's3'];

  it('ranks players by the tournament round they reached, sharing a rank within it', () => {
    expect(
      placings(singleEliminationStandings(seeds(5), reached, byes)),
    ).toEqual([
      ['s1', 1],
      ['s3', 1],
      ['s2', 3],
      ['s4', 3],
      ['s5', 5],
    ]);
  });

  it('ranks the winner of the final alone first', () => {
    const standings = singleEliminationStandings(
      seeds(5),
      [...reached, final],
      byes,
    );
    expect(placings(standings)).toEqual([
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

  it('counts a forfeit both players dropped from for neither', () => {
    const standings = singleEliminationStandings(
      ['a', 'b', 'c', 'd'],
      [forfeited('a', 'b', 'a'), won('c', 'd')],
      [],
      ['a', 'b'],
    );
    expect(placings(standings)).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 2],
      ['d', 2],
    ]);
  });

  it('ranks nobody first when both finalists dropped, the finalists sharing second', () => {
    // s1 beat s4 and s2 beat s3, then both dropped: the final is a forfeit.
    const standings = singleEliminationStandings(
      seeds(4),
      [won('s1', 's4'), won('s2', 's3'), forfeited('s1', 's2', 's1')],
      [],
      ['s1', 's2'],
    );
    expect(placings(standings)).toEqual([
      ['s1', 2],
      ['s2', 2],
      ['s3', 3],
      ['s4', 3],
    ]);
    expect(trophyHolders(standings)).toEqual([]);
  });

  it('keeps a forfeit win once its winner played on, though both its players dropped', () => {
    // s4 dropped in tournament round 1, so s1 advanced on the forfeit, lost the final to s2, then dropped.
    const standings = singleEliminationStandings(
      seeds(4),
      [
        { ...forfeited('s1', 's4', 's4'), nextRoundPlayers: ['s1', 's2'] },
        won('s2', 's3'),
        won('s2', 's1'),
      ],
      [],
      ['s4', 's1'],
    );
    expect(placings(standings)).toEqual([
      ['s2', 1],
      ['s1', 2],
      ['s3', 3],
      ['s4', 3],
    ]);
  });

  it('leaves unreported matches out', () => {
    const standings = singleEliminationStandings(
      ['a', 'b'],
      [{ players: ['a', 'b'], outcome: null }],
      [],
    );
    expect(placings(standings)).toEqual([
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

describe('agreedAdvancingPlayer', () => {
  const twoOne: MatchOutcome = { kind: 'GameScore', games: [2, 1], draws: 0 };
  const forfeit = { kind: 'Forfeit', forfeitedBy: 'a' } as const;
  const unreported = { reportedBy: null, confirmed: false };
  const player = (playerId: string) => ({ kind: 'Player', playerId }) as const;
  const nobody = { kind: 'Nobody' } as const;
  const notAgreed = { kind: 'NotAgreed' } as const;

  it('is the opponent of a player who dropped, on the forfeit', () => {
    expect(
      agreedAdvancingPlayer(
        { players: ['a', 'b'], outcome: forfeit, ...unreported },
        ['a'],
        false,
      ),
    ).toEqual(player('b'));
  });

  it('is nobody when both players dropped before playing', () => {
    expect(
      agreedAdvancingPlayer(
        { players: ['a', 'b'], outcome: forfeit, ...unreported },
        ['b', 'a'],
        false,
      ),
    ).toEqual(nobody);
  });

  it('is nobody when both players dropped before the next tournament round was paired with either', () => {
    expect(
      agreedAdvancingPlayer(
        {
          players: ['a', 'b'],
          outcome: forfeit,
          ...unreported,
          nextRoundPlayers: ['c', 'd'],
        },
        ['b', 'a'],
        false,
      ),
    ).toEqual(nobody);
  });

  it('is the winner of a forfeit who played on in the next tournament round, though they dropped since', () => {
    expect(
      agreedAdvancingPlayer(
        {
          players: ['a', 'b'],
          outcome: forfeit,
          ...unreported,
          nextRoundPlayers: ['b', 'c'],
        },
        ['a', 'b'],
        true,
      ),
    ).toEqual(player('b'));
  });

  it('is the winner of a played match, even if both dropped since', () => {
    expect(
      agreedAdvancingPlayer(
        {
          players: ['a', 'b'],
          outcome: twoOne,
          reportedBy: 'org',
          confirmed: false,
        },
        ['a', 'b'],
        false,
      ),
    ).toEqual(player('a'));
  });

  it('is the player with a bye, unless they dropped', () => {
    const bye = { players: ['a', null], outcome: null, ...unreported } as const;
    expect(agreedAdvancingPlayer(bye, [], false)).toEqual(player('a'));
    expect(agreedAdvancingPlayer(bye, ['a'], false)).toEqual(nobody);
  });

  it('is nobody from a bye whose player dropped before the next tournament round was paired with them', () => {
    const bye = {
      players: ['a', null],
      outcome: null,
      ...unreported,
      nextRoundPlayers: ['b', 'c'],
    } as const;
    expect(agreedAdvancingPlayer(bye, ['a'], true)).toEqual(nobody);
  });

  it('is the player with a bye who was paired in the next tournament round, though they dropped since', () => {
    const bye = {
      players: ['a', null],
      outcome: null,
      ...unreported,
      nextRoundPlayers: ['a', 'b'],
    } as const;
    expect(agreedAdvancingPlayer(bye, ['a'], true)).toEqual(player('a'));
  });

  it('is not agreed while the match is unreported, even once its round is completed', () => {
    expect(
      agreedAdvancingPlayer(
        { players: ['a', 'b'], outcome: null, ...unreported },
        [],
        true,
      ),
    ).toEqual(notAgreed);
  });

  it.each<[string, { reportedBy: string | null; confirmed: boolean }, object]>([
    [
      'not agreed while its player’s report is unconfirmed',
      { reportedBy: 'b', confirmed: false },
      notAgreed,
    ],
    [
      'the winner once the other player confirms it',
      { reportedBy: 'b', confirmed: true },
      player('a'),
    ],
    [
      'the winner of a game score the organizer entered',
      { reportedBy: 'org', confirmed: false },
      player('a'),
    ],
  ])('is %s', (_, fields, advancing) => {
    expect(
      agreedAdvancingPlayer(
        { players: ['a', 'b'], outcome: twoOne, ...fields },
        [],
        false,
      ),
    ).toEqual(advancing);
  });

  it('is the winner of a granted win', () => {
    expect(
      agreedAdvancingPlayer(
        {
          players: ['a', 'b'],
          outcome: { kind: 'GrantedWin', winner: 'b' },
          ...unreported,
        },
        [],
        false,
      ),
    ).toEqual(player('b'));
  });

  it('is the winner once the match’s tournament round is completed, confirmed or not', () => {
    expect(
      agreedAdvancingPlayer(
        {
          players: ['a', 'b'],
          outcome: twoOne,
          reportedBy: 'b',
          confirmed: false,
        },
        [],
        true,
      ),
    ).toEqual(player('a'));
  });
});

describe('countAdvancing', () => {
  it('counts the players a tournament round’s matches and byes send on', () => {
    const forfeit = { kind: 'Forfeit', forfeitedBy: 'c' } as const;
    expect(
      countAdvancing(
        [
          { players: ['a', 'b'], outcome: { kind: 'GrantedWin', winner: 'a' } },
          { players: ['c', 'd'], outcome: forfeit },
          { players: ['e', null], outcome: null },
          { players: ['f', null], outcome: null },
        ],
        ['c', 'd', 'f'],
      ),
    ).toBe(2);
  });
});

describe('dependentBracketPlaces', () => {
  it('is every later match its winner feeds, up to the final', () => {
    expect(dependentBracketPlaces({ round: 1, bracketPlace: 5 }, 4)).toEqual([
      { round: 2, bracketPlace: 2 },
      { round: 3, bracketPlace: 1 },
      { round: 4, bracketPlace: 0 },
    ]);
  });

  it('is none for the final', () => {
    expect(dependentBracketPlaces({ round: 3, bracketPlace: 0 }, 3)).toEqual(
      [],
    );
  });
});

describe('bracketRounds', () => {
  const player = (playerId: string) => ({ kind: 'Player', playerId }) as const;
  const winnerToCome = (bracketPlace: number) =>
    ({ kind: 'WinnerToCome', bracketPlace }) as const;
  const bye = { kind: 'Bye' } as const;
  const notAgreed = { kind: 'NotAgreed' } as const;
  const nobody = { kind: 'Nobody' } as const;
  const match = (
    round: number,
    bracketPlace: number,
    players: [string, string | null],
    advancing: Advancing,
  ): PlayedBracketMatch => ({ round, bracketPlace, players, advancing });

  it('draws every tournament round, the unpaired ones fed by the bracket places before them', () => {
    // 3 players: s1 has a bye, s2 plays s3, unreported.
    expect(
      bracketRounds(
        2,
        [
          match(1, 0, ['s1', null], player('s1')),
          match(1, 1, ['s2', 's3'], notAgreed),
        ],
        [],
      ),
    ).toEqual([
      {
        round: 1,
        places: [
          { bracketPlace: 0, sides: [player('s1'), bye], advancing: 's1' },
          {
            bracketPlace: 1,
            sides: [player('s2'), player('s3')],
            advancing: null,
          },
        ],
      },
      {
        round: 2,
        places: [
          {
            bracketPlace: 0,
            sides: [player('s1'), winnerToCome(1)],
            advancing: null,
          },
        ],
      },
    ]);
  });

  it('puts a match’s winner in the next bracket place before that round is paired, and leaves later ones to the winners of the places feeding them', () => {
    // 8 players: s1, s5 and s3 have won; s2 v s7 is unreported.
    const rounds = bracketRounds(
      3,
      [
        match(1, 0, ['s1', 's8'], player('s1')),
        match(1, 1, ['s4', 's5'], player('s5')),
        match(1, 2, ['s2', 's7'], notAgreed),
        match(1, 3, ['s3', 's6'], player('s3')),
      ],
      [],
    );
    expect(rounds.slice(1)).toEqual([
      {
        round: 2,
        places: [
          {
            bracketPlace: 0,
            sides: [player('s1'), player('s5')],
            advancing: null,
          },
          {
            bracketPlace: 1,
            sides: [winnerToCome(2), player('s3')],
            advancing: null,
          },
        ],
      },
      {
        round: 3,
        places: [
          {
            bracketPlace: 0,
            sides: [winnerToCome(0), winnerToCome(1)],
            advancing: null,
          },
        ],
      },
    ]);
  });

  it('draws a paired tournament round as it was paired', () => {
    const rounds = bracketRounds(
      2,
      [
        match(1, 0, ['s1', 's4'], player('s1')),
        match(1, 1, ['s2', 's3'], player('s3')),
        match(2, 0, ['s1', 's3'], player('s3')),
      ],
      [],
    );
    expect(rounds[1]).toEqual({
      round: 2,
      places: [
        {
          bracketPlace: 0,
          sides: [player('s1'), player('s3')],
          advancing: 's3',
        },
      ],
    });
  });

  it('gives the player waiting on a match nobody advances from a bye at once, which sends them on', () => {
    // 8 players: s1 won; s4 v s5 both dropped; s2 v s7 and s3 v s6 unreported.
    const rounds = bracketRounds(
      3,
      [
        match(1, 0, ['s1', 's8'], player('s1')),
        match(1, 1, ['s4', 's5'], nobody),
        match(1, 2, ['s2', 's7'], notAgreed),
        match(1, 3, ['s3', 's6'], notAgreed),
      ],
      ['s4', 's5'],
    );
    expect(rounds.slice(1)).toEqual([
      {
        round: 2,
        places: [
          { bracketPlace: 0, sides: [player('s1'), bye], advancing: 's1' },
          {
            bracketPlace: 1,
            sides: [winnerToCome(2), winnerToCome(3)],
            advancing: null,
          },
        ],
      },
      {
        round: 3,
        places: [
          {
            bracketPlace: 0,
            sides: [player('s1'), winnerToCome(1)],
            advancing: null,
          },
        ],
      },
    ]);
  });

  it('puts the waiting player first, and sends nobody on from the bye of a player who dropped', () => {
    // 4 players: s1 v s4 both dropped; s2 won, and has dropped since.
    const rounds = bracketRounds(
      2,
      [
        match(1, 0, ['s1', 's4'], nobody),
        match(1, 1, ['s2', 's3'], player('s2')),
      ],
      ['s1', 's4', 's2'],
    );
    expect(rounds[1].places).toEqual([
      { bracketPlace: 0, sides: [player('s2'), bye], advancing: null },
    ]);
  });

  it('gives a bracket place nobody reaches two byes, from which nobody advances', () => {
    const rounds = bracketRounds(
      2,
      [match(1, 0, ['s1', 's4'], nobody), match(1, 1, ['s2', 's3'], nobody)],
      ['s1', 's2', 's3', 's4'],
    );
    expect(rounds[1].places).toEqual([
      { bracketPlace: 0, sides: [bye, bye], advancing: null },
    ]);
  });
});

describe('byesSendingOn', () => {
  it('is every bye but that of a player who dropped before the next tournament round was paired with them', () => {
    // s1 had a bye in round 1 and was paired in round 2; s5 had one in round 2 and dropped.
    const sent = byesSendingOn(
      [
        { byes: ['s1', 's2'], nextRoundPlayers: ['s1', 's2', 's3'] },
        { byes: ['s5'], nextRoundPlayers: [] },
      ],
      ['s1', 's5'],
    );
    expect(sent).toEqual(['s1', 's2']);
  });
});

describe('the single elimination trophy', () => {
  const semifinals = [won('s1', 's4'), won('s2', 's3')];

  it('is the winner of the final', () => {
    const standings = singleEliminationStandings(
      seeds(4),
      [...semifinals, won('s2', 's1')],
      [],
    );
    expect(trophyHolders(standings)).toEqual(['s2']);
  });

  it('is the other finalist alone when one finalist dropped', () => {
    const standings = singleEliminationStandings(
      seeds(4),
      [...semifinals, forfeited('s1', 's2', 's1')],
      [],
      ['s1'],
    );
    expect(trophyHolders(standings)).toEqual(['s2']);
  });

  it('is nobody when both finalists dropped', () => {
    const standings = singleEliminationStandings(
      seeds(4),
      [...semifinals, forfeited('s1', 's2', 's1')],
      [],
      ['s1', 's2'],
    );
    expect(trophyHolders(standings)).toEqual([]);
  });

  it('is the one player left when the tournament completes before its final', () => {
    // 4 players, completed after round 1: s1 won, s2 v s3 both dropped.
    const standings = singleEliminationStandings(
      seeds(4),
      [won('s1', 's4'), forfeited('s2', 's3', 's2')],
      [],
      ['s2', 's3'],
    );
    expect(trophyHolders(standings)).toEqual(['s1']);
  });
});
