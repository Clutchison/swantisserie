import type { MatchReportRequest, TournamentView } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  completeRound,
  postCompleteRound,
  completeTournament,
  dropPlayer,
  getDraft,
  playingTournament,
  reinstate,
  reportCurrentRound,
  reportMatch,
  reportWin,
  setUpTournament,
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
      // Setup joined all three.
      expect(view.roundCount).toBe(2);
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
    expect(view).toMatchObject({
      completeRoundGrants: 'GrantedDraws',
      standingsAwaitCompletedRounds: true,
      reopenRound: null,
    });
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0].round).toBe(1);
    expect(view.rounds[0].byes).toEqual([]);
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
    expect(new Set([...round.matches[0].players, ...round.byes])).toEqual(
      new Set([alice.id, bob.id, carol.id]),
    );
  });
});

describe('reporting in a Swiss tournament', () => {
  it('lists every player level until tournament round 1 is completed, though a match is reported', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [winner, loser] = (await tournamentView(id)).rounds[0].matches[0]
      .players;

    await reportWin(id, [winner, loser], [2, 1], cookieOf[loser]);

    const { standings } = await tournamentView(id);
    expect(standings).toHaveLength(3);
    for (const standing of standings) {
      expect(standing).toMatchObject({
        rank: 1,
        matchPoints: 0,
        matches: { won: 0, lost: 0, drawn: 0 },
      });
    }
  });

  it('counts a completed tournament round’s matches, and its bye as a 2–0 win, in the standings', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [round] = (await tournamentView(id)).rounds;
    const [winner, loser] = round.matches[0].players;

    await reportWin(id, [winner, loser], [2, 1], cookieOf[loser]);
    await completeRound(id).expect(200);

    const { standings } = await tournamentView(id);
    // The winner and the player with the bye are level on opponents'
    // match-win % (the 33% floor), and the bye's 2–0 is the better
    // game-win %.
    expect(standings).toHaveLength(3);
    expect(standings[0]).toMatchObject({
      playerId: round.byes[0],
      rank: 1,
      matchPoints: 3,
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 2, lost: 0, drawn: 0 },
      opponentsMatchWinPercent: 33,
    });
    expect(standings[1]).toMatchObject({
      playerId: winner,
      rank: 2,
      matchPoints: 3,
      games: { won: 2, lost: 1, drawn: 0 },
      opponentsMatchWinPercent: 33,
    });
    expect(standings[2]).toMatchObject({
      playerId: loser,
      rank: 3,
      matchPoints: 0,
    });
  });
});

describe('Swiss standings', () => {
  it('order players level on match points by the MTR’s tiebreakers, and the trophy goes only to whoever is first after them', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [roundOne] = (await tournamentView(id)).rounds;
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const { rounds } = await tournamentView(id);
    // Each match's first player won it 2–0. Tournament round 1's winners met
    // in tournament round 2; completing it grants that match a draw, so
    // they're level on 4 match points and 100% game-win %.
    const roundOneWinners = roundOne.matches.map((m) => m.players[0]);
    const top = rounds[1].matches.find((m) =>
      roundOneWinners.includes(m.players[0]),
    )!;
    const bottom = rounds[1].matches.find((m) => m !== top)!;
    await reportMatch(id, bottom.id, cookieOf[bottom.players[0]], {
      games: [2, 0],
    } satisfies MatchReportRequest).expect(200);
    await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: top.id, drop: [] }],
    }).expect(200);

    // The leader is the tournament round 1 winner whose opponent then went
    // on to win tournament round 2: their opponents' match-win % is higher.
    const bottomWinner = bottom.players[0];
    const beatBottomWinner = roundOne.matches.find((m) =>
      m.players.includes(bottomWinner),
    )!.players[0];
    const other = top.players.find((p) => p !== beatBottomWinner)!;
    const view = await tournamentView(id);
    expect(
      view.standings.map(({ playerId, rank }) => [playerId, rank]),
    ).toEqual([
      [beatBottomWinner, 1],
      [other, 2],
      [bottomWinner, 3],
      [bottom.players[1], 4],
    ]);
    expect(view.standings[0]).toMatchObject({
      matchPoints: 4,
      gameWinPercent: 100,
      opponentsGameWinPercent: expect.any(Number),
    });
    expect(view.standings[0].opponentsMatchWinPercent).toBeCloseTo(
      (200 / 3 + 50) / 2,
    );
    expect(view.standings[1].opponentsMatchWinPercent).toBeCloseTo(
      (200 / 3 + 33) / 2,
    );
    expect(view.trophyHolders).toEqual([beatBottomWinner]);
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
    await reportCurrentRound(id, cookieOf);

    await completeRound(id, bobCookie).expect(403);

    expect((await tournamentView(id)).state).toBe('Playing');
  });

  it('pairs the next tournament round with no rematches once every match is reported', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportCurrentRound(id, cookieOf);

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
    await reportCurrentRound(id, cookieOf);

    await completeRound(id).expect(200);

    const { rounds } = await tournamentView(id);
    expect(rounds[1].byes).toEqual([loser]);
    expect(new Set(rounds[1].matches[0].players)).toEqual(
      new Set([winner, ...round.byes]),
    );
  });

  it('completes the tournament after the last tournament round, naming the trophy holder', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    await reportCurrentRound(id, cookieOf);

    const answer = await completeRound(id).expect(200);

    expect(answer.body.tournament).toEqual({ state: 'Complete' });
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
  return [...round.matches.flatMap((match) => match.players), ...round.byes];
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
    }).expect(200);

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
    }).expect(409);

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
    }).expect(200);

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
      const answer = await postCompleteRound(id, { round: 1, ...body }).expect(
        400,
      );
      expect(answer.body.error).toBe('invalid');
    }
  });

  it('rejects granted wins, which are single elimination’s', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    const [match] = (await tournamentView(id)).rounds[0].matches;

    const answer = await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: match.id, winner: alice.id }],
    }).expect(400);

    expect(answer.body.error).toBe('invalid');
    expect((await tournamentView(id)).lastCompletedRound).toBe(0);
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
    }).expect(200);

    const view = await tournamentView(id);
    expect(view.roundCount).toBe(2);
    expect(view.state).toBe('Complete');
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds).toHaveLength(1);
    expect(view.trophyHolders).toEqual(round.byes);
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
      }).expect(400);
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
    }).expect(409);

    expect(answer.body.error).toBe('match-reported');
    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(view.rounds[0].matches[0].outcome.kind).toBe('GameScore');
  });

  it('is refused for a tournament round already completed, changing nothing', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const before = await getDraft(id).expect(200);
    const view = await tournamentView(id);

    const answer = await completeRound(id, aliceCookie, {
      round: 1,
      grantedDraws: view.rounds[1].matches.map((match) => ({
        matchId: match.id,
        drop: [],
      })),
    }).expect(409);

    expect(answer.body).toEqual({
      error: 'round-completed',
      message: 'Tournament round 1 is already completed.',
    });
    expect(await tournamentView(id)).toEqual(view);
    expect((await getDraft(id).expect(200)).body.version).toBe(
      before.body.version,
    );
  });

  it('rejects a body that names no tournament round, or one ahead of the current one', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportCurrentRound(id, cookieOf);

    for (const body of [undefined, {}, { round: 0 }, { round: '1' }]) {
      const answer = await postCompleteRound(id, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
    const ahead = await completeRound(id, aliceCookie, { round: 2 }).expect(
      400,
    );
    expect(ahead.body.error).toBe('invalid');
    expect((await tournamentView(id)).lastCompletedRound).toBe(0);
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
    }).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});

describe('dropping from a Swiss tournament', () => {
  it('leaves the player out of the next tournament round', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [played, unplayed] = (await tournamentView(id)).rounds[0].matches;
    await reportWin(id, played.players, [2, 0], cookieOf[played.players[1]]);
    const gone = unplayed.players[0];

    await dropPlayer(id, gone, cookieOf[gone]).expect(200);

    await completeRound(id).expect(200);
    const view = await tournamentView(id);
    expect(seated(view.rounds[1])).toHaveLength(3);
    expect(seated(view.rounds[1])).not.toContain(gone);
  });
});

describe('reinstating a player in a Swiss tournament', () => {
  it('is allowed before the next tournament round is paired, which then pairs them', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const gone = match.players[1];
    await dropPlayer(id, gone, cookieOf[gone]).expect(200);

    await reinstate(id, gone).expect(200);

    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    expect(seated((await tournamentView(id)).rounds[1])).toContain(gone);
  });

  it('is refused once a later tournament round has been paired after their drop', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const gone = match.players[1];
    await dropPlayer(id, gone, cookieOf[gone]).expect(200);
    await reportCurrentRound(id, cookieOf);
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
    }).expect(200);

    const answer = await reinstate(id, gone).expect(409);

    expect(answer.body.error).toBe('paired-since-drop');
    expect(droppedIn(await tournamentView(id))).toEqual([gone]);
  });
});
