import type {
  CompleteRoundRequest,
  MatchReportRequest,
  TournamentView,
} from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  clearGameScore,
  completeDraft,
  completeRound,
  completeTournament,
  dropPlayer,
  fullDeck,
  getDraft,
  joinTournament,
  matchOf,
  playingTournament,
  reinstate,
  reportLatestRound,
  reportWin,
  setGameScore,
  setUpTournament,
  setWin,
  signIn,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A fourth player, who signs in only where a spec needs four. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;
let daveCookie: string;
/** Each player's cookie by their Discord user id. */
let cookieOf: Record<string, string>;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  daveCookie = await signIn(dave);
  cookieOf = {
    [alice.id]: aliceCookie,
    [bob.id]: bobCookie,
    [carol.id]: carolCookie,
    [dave.id]: daveCookie,
  };
});

/** Every pair of players who have met, sorted, as "a-b". */
function pairsOf(view: TournamentView) {
  return view.rounds.flatMap((round) =>
    round.matches.map(({ players }) => [...players].sort().join('-')),
  );
}

describe('Swiss tournament setup', () => {
  it.each(['UntilWinner', 'CappedAt3'] as const)(
    'sets up a Swiss tournament with the round option %s',
    async (option) => {
      const id = await completeDraft([aliceCookie, bobCookie, carolCookie]);

      await setUpTournament(id, aliceCookie, swiss(option)).expect(201);

      const view = await tournamentView(id);
      expect(view).toMatchObject({
        format: 'Swiss',
        swissRoundOption: option,
        state: 'Registration',
        lastCompletedRound: 0,
      });
      for (const cookie of [aliceCookie, bobCookie, carolCookie]) {
        await fullDeck(id, cookie);
        await joinTournament(id, cookie).expect(201);
      }
      expect((await tournamentView(id)).roundCount).toBe(2);
    },
  );

  it('rejects Swiss without a round option, or with one not on offer', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    for (const body of [
      { format: 'Swiss' },
      { format: 'Swiss', swissRoundOption: 'CappedAt5' },
    ]) {
      const answer = await setUpTournament(id, aliceCookie, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
  });
});

describe('starting a Swiss tournament', () => {
  it('pairs round 1 and opens only its matches', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );

    const view = await tournamentView(id);
    expect(view.roundCount).toBe(2);
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0].round).toBe(1);
    expect(view.rounds[0].bye).toBeNull();
    const seated = view.rounds[0].matches.flatMap((match) => match.players);
    expect(seated.sort()).toEqual([alice.id, bob.id, carol.id, dave.id].sort());
    expect(
      view.rounds[0].matches.every(
        (match) => match.outcome.kind === 'Unreported',
      ),
    ).toBe(true);
  });

  it('gives an odd count’s round 1 a bye', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );

    const [round] = (await tournamentView(id)).rounds;
    expect(round.matches).toHaveLength(1);
    expect(new Set([...round.matches[0].players, round.bye])).toEqual(
      new Set([alice.id, bob.id, carol.id]),
    );
  });
});

describe('reporting in a Swiss tournament', () => {
  it('counts a reported match, and a bye as a 2–0 win, in the standings', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [round] = (await tournamentView(id)).rounds;
    const [winner, loser] = round.matches[0].players;

    await reportWin(id, [winner, loser], [2, 1], cookieOf[loser]);

    const { standings } = await tournamentView(id);
    // The winner and the player with the bye share first, in join order.
    expect(standings).toHaveLength(3);
    expect(standings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: winner,
          rank: 1,
          matchPoints: 3,
          games: { won: 2, lost: 1, drawn: 0 },
        }),
        expect.objectContaining({
          playerId: round.bye,
          rank: 1,
          matchPoints: 3,
          matches: { won: 1, lost: 0, drawn: 0 },
          games: { won: 2, lost: 0, drawn: 0 },
        }),
      ]),
    );
    expect(standings[2]).toMatchObject({
      playerId: loser,
      rank: 3,
      matchPoints: 0,
    });
  });
});

describe('completing a tournament round', () => {
  it('is refused while the tournament round has an unreported match', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first] = (await tournamentView(id)).rounds[0].matches;
    await reportWin(id, first.players, [2, 0], cookieOf[first.players[0]]);

    const answer = await completeRound(id).expect(409);

    expect(answer.body.error).toBe('unreported-matches');
    const view = await tournamentView(id);
    expect(view.rounds).toHaveLength(1);
    expect(view.lastCompletedRound).toBe(0);
  });

  it('is for the organizer only', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    await reportLatestRound(id, cookieOf);

    await completeRound(id, bobCookie).expect(403);

    expect((await tournamentView(id)).state).toBe('Playing');
  });

  it('pairs the next tournament round with no rematches once every match is reported', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);

    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(view.rounds[1].matches).toHaveLength(2);
    expect(
      view.rounds[1].matches.every(
        (match) => match.outcome.kind === 'Unreported',
      ),
    ).toBe(true);
    const pairs = pairsOf(view);
    expect(new Set(pairs).size).toBe(pairs.length);
    // Round 1's two winners meet, and so do its two losers.
    const winners = new Set(
      view.standings.filter((s) => s.matchPoints === 3).map((s) => s.playerId),
    );
    for (const { players } of view.rounds[1].matches) {
      expect(winners.has(players[0])).toBe(winners.has(players[1]));
    }
  });

  it('gives the next bye to the lowest-ranked player who hasn’t had one', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [round] = (await tournamentView(id)).rounds;
    const [winner, loser] = round.matches[0].players;
    await reportLatestRound(id, cookieOf);

    await completeRound(id).expect(200);

    const { rounds } = await tournamentView(id);
    expect(rounds[1].bye).toBe(loser);
    expect(new Set(rounds[1].matches[0].players)).toEqual(
      new Set([winner, round.bye]),
    );
  });

  it('completes the tournament after the last tournament round, naming the trophy holder', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    await reportLatestRound(id, cookieOf);

    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.lastCompletedRound).toBe(2);
    expect(view.rounds).toHaveLength(2);
    const [best] = view.standings;
    expect(best.matchPoints).toBe(6);
    expect(view.trophyHolders).toEqual([best.playerId]);
    expect((await completeRound(id).expect(409)).body.error).toBe(
      'not-playing',
    );
  });

  it('bumps the draft’s version', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    await reportLatestRound(id, cookieOf);
    const before = await getDraft(id).expect(200);

    const answer = await completeRound(id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
    expect(answer.body.tournament).toEqual({ state: 'Complete' });
  });

  it('isn’t for round robin, which completes as a whole; and Swiss doesn’t complete as a whole', async () => {
    const roundRobin = await playingTournament([aliceCookie, bobCookie]);
    expect((await completeRound(roundRobin).expect(409)).body.error).toBe(
      'wrong-format',
    );

    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    expect((await completeTournament(id).expect(409)).body.error).toBe(
      'wrong-format',
    );
  });
});

/** Every player seated in the tournament round: in a match or with its bye. */
function seated(round: TournamentView['rounds'][number]) {
  return [
    ...round.matches.flatMap((match) => match.players),
    ...(round.bye ? [round.bye] : []),
  ];
}

/** The ids of the tournament's dropped players. */
function droppedIn(view: TournamentView) {
  return view.entries
    .filter((entry) => entry.dropped)
    .map((entry) => entry.playerId);
}

describe('completing a Swiss tournament round with unreported matches', () => {
  it('grants a draw in each and drops the players chosen for it', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first, second] = (await tournamentView(id)).rounds[0].matches;
    const gone = first.players[0];

    await completeRound(id, aliceCookie, {
      grantedDraws: [
        { matchId: first.id, drop: [gone] },
        { matchId: second.id, drop: [] },
      ],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds[0].matches.map((match) => match.outcome)).toEqual([
      { kind: 'GrantedDraw' },
      { kind: 'GrantedDraw' },
    ]);
    expect(droppedIn(view)).toEqual([gone]);
    expect(view.standings.find((s) => s.playerId === gone)).toMatchObject({
      matchPoints: 1,
      matches: { won: 0, lost: 0, drawn: 1 },
    });
    // The three undropped players are paired, one of them with the bye.
    expect(view.rounds).toHaveLength(2);
    expect(seated(view.rounds[1]).sort()).toEqual(
      [alice.id, bob.id, carol.id, dave.id].filter((p) => p !== gone).sort(),
    );
  });

  it('is refused while an unreported match is left unlisted', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first] = (await tournamentView(id)).rounds[0].matches;

    const answer = await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: first.id, drop: first.players }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('unreported-matches');
    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(view.rounds[0].matches.map((match) => match.outcome.kind)).toEqual([
      'Unreported',
      'Unreported',
    ]);
    expect(droppedIn(view)).toEqual([]);
  });

  it('ignores drop choices in the final tournament round, which completes the tournament', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    const [match] = (await tournamentView(id)).rounds[0].matches;

    await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: match.id, drop: match.players }],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'GrantedDraw' });
    expect(droppedIn(view)).toEqual([]);
    // Both share first on one granted draw each.
    expect(view.trophyHolders.sort()).toEqual([alice.id, bob.id].sort());
  });

  it('rejects granted draws that aren’t match ids with lists of players', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());

    for (const body of [
      { grantedDraws: 'all' },
      { grantedDraws: [{ matchId: 'm' }] },
      { grantedDraws: [{ matchId: 'm', drop: [1] }] },
    ]) {
      const answer = await completeRound(id, aliceCookie, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
  });

  it('completes the tournament when fewer than 2 undropped players remain', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [round] = (await tournamentView(id)).rounds;
    const [match] = round.matches;

    await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: match.id, drop: match.players }],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.roundCount).toBe(2);
    expect(view.state).toBe('Complete');
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds).toHaveLength(1);
    expect(view.trophyHolders).toEqual([round.bye]);
  });

  it('rejects a match that isn’t the tournament round’s, and a player to drop who isn’t in the match', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first, second] = (await tournamentView(id)).rounds[0].matches;
    const outsider = second.players[0];

    for (const grantedDraws of [
      [
        { matchId: first.id, drop: [] },
        { matchId: second.id, drop: [] },
        { matchId: 'no-such-match', drop: [] },
      ],
      [
        { matchId: first.id, drop: [outsider] },
        { matchId: second.id, drop: [] },
      ],
    ]) {
      const answer = await completeRound(id, aliceCookie, {
        grantedDraws,
      } satisfies CompleteRoundRequest).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(droppedIn(view)).toEqual([]);
  });

  it('is refused for a match reported since the organizer listed it', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first, second] = (await tournamentView(id)).rounds[0].matches;
    await reportWin(id, first.players, [2, 0], cookieOf[first.players[0]]);

    const answer = await completeRound(id, aliceCookie, {
      grantedDraws: [
        { matchId: first.id, drop: [] },
        { matchId: second.id, drop: [] },
      ],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('match-reported');
    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(view.rounds[0].matches[0].outcome.kind).toBe('GameScore');
  });

  it('bumps the draft’s version once', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const matches = (await tournamentView(id)).rounds[0].matches;
    const before = await getDraft(id).expect(200);

    const answer = await completeRound(id, aliceCookie, {
      grantedDraws: matches.map((match) => ({
        matchId: match.id,
        drop: [match.players[1]],
      })),
    } satisfies CompleteRoundRequest).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});

describe('dropping from a Swiss tournament', () => {
  it('forfeits the current unplayed match, and leaves the player out of the next tournament round', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [played, unplayed] = (await tournamentView(id)).rounds[0].matches;
    await reportWin(id, played.players, [2, 0], cookieOf[played.players[1]]);
    const gone = unplayed.players[0];
    const before = await getDraft(id).expect(200);

    const answer = await dropPlayer(id, gone, cookieOf[gone]).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
    expect((await matchOf(id, ...unplayed.players)).outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: gone,
    });
    await completeRound(id).expect(200);
    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome.kind).toBe('GameScore');
    expect(seated(view.rounds[1])).toHaveLength(3);
    expect(seated(view.rounds[1])).not.toContain(gone);
  });
});

describe('correcting a Swiss tournament', () => {
  it('keeps the next tournament round’s pairings and changes only the standings', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    const before = await tournamentView(id);
    const [winner, loser] = before.rounds[0].matches[0].players;

    await setWin(id, [loser, winner], [2, 1]);

    const after = await tournamentView(id);
    expect(after.rounds[1]).toEqual(before.rounds[1]);
    expect(after.lastCompletedRound).toBe(1);
    expect(after.standings.find((s) => s.playerId === loser)).toMatchObject({
      matchPoints: 3,
    });
    expect(after.standings.find((s) => s.playerId === winner)).toMatchObject({
      matchPoints: 0,
    });
  });

  it('makes a cleared match of a completed tournament round a granted draw, the tournament round staying completed', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const before = await getDraft(id).expect(200);

    const answer = await clearGameScore(id, match.id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'GrantedDraw' });
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds).toHaveLength(2);
  });

  it('keeps a dropped player’s cleared match of a completed tournament round their forfeit', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const gone = match.players[1];
    await dropPlayer(id, gone, cookieOf[gone]).expect(200);
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    await setGameScore(id, match.id, {
      games: [0, 2],
    } satisfies MatchReportRequest).expect(200);

    await clearGameScore(id, match.id).expect(200);

    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: gone,
    });
    expect(view.standings.find((s) => s.playerId === gone)).toMatchObject({
      matchPoints: 0,
    });
  });
});

describe('reinstating a player in a Swiss tournament', () => {
  it('turns their forfeits back into unreported matches before the next tournament round is paired', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const gone = match.players[1];
    await dropPlayer(id, gone, cookieOf[gone]).expect(200);
    const before = await getDraft(id).expect(200);

    const answer = await reinstate(id, gone).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'Unreported' });
    expect(droppedIn(view)).toEqual([]);
  });

  it('is refused once a later tournament round has been paired after their drop', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const gone = match.players[1];
    await dropPlayer(id, gone, cookieOf[gone]).expect(200);
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);

    const answer = await reinstate(id, gone).expect(409);

    expect(answer.body.error).toBe('paired-since-drop');
    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: gone,
    });
    expect(droppedIn(view)).toEqual([gone]);
  });

  it('is refused for a player dropped as their tournament round was completed, once the next is paired', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const matches = (await tournamentView(id)).rounds[0].matches;
    const gone = matches[0].players[0];
    await completeRound(id, aliceCookie, {
      grantedDraws: matches.map((match, i) => ({
        matchId: match.id,
        drop: i === 0 ? [gone] : [],
      })),
    } satisfies CompleteRoundRequest).expect(200);

    const answer = await reinstate(id, gone).expect(409);

    expect(answer.body.error).toBe('paired-since-drop');
    expect(droppedIn(await tournamentView(id))).toEqual([gone]);
  });
});
