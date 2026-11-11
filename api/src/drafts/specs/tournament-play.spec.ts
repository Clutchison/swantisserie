import {
  alice,
  aliceCookie,
  bob,
  byeId,
  carol,
  completeRound,
  completeTournament,
  cookiesByPlayer,
  expectCompletedSince,
  matchOf,
  playingTournament,
  reportCurrentRound,
  reportMatch,
  reportWin,
  setBasic,
  signIn,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A viewer who isn't one of the draft's players. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
});

describe('reporting a match', () => {
  it('lets either of a match’s players report 2–0 or 2–1 for either side', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);

    await reportWin(id, [bob.id, alice.id], [2, 1], aliceCookie);
    await reportWin(id, [carol.id, bob.id], [2, 0], carolCookie);

    const bobVsAlice = await matchOf(id, alice.id, bob.id);
    expect(bobVsAlice.outcome).toEqual({
      kind: 'GameScore',
      games: bobVsAlice.players[0] === bob.id ? [2, 1] : [1, 2],
      draws: 0,
    });
    expect(bobVsAlice.reportedBy).toBe(alice.id);
    expect(bobVsAlice.confirmed).toBe(false);
    expect((await matchOf(id, bob.id, carol.id)).reportedBy).toBe(carol.id);
    expect((await matchOf(id, alice.id, carol.id)).outcome).toEqual({
      kind: 'Unreported',
    });
  });

  it('locks a reported match to both its players', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);

    for (const cookie of [aliceCookie, bobCookie]) {
      const answer = await reportWin(
        id,
        [bob.id, alice.id],
        [2, 1],
        cookie,
        409,
      );
      expect(answer.status).toBe(409);
      expect(answer.body.error).toBe('match-reported');
    }
    expect((await matchOf(id, alice.id, bob.id)).reportedBy).toBe(alice.id);
  });

  it('refuses the draft’s other players, and viewers who aren’t players', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    const daveCookie = await signIn(dave);

    for (const cookie of [carolCookie, daveCookie]) {
      const answer = await reportWin(
        id,
        [alice.id, bob.id],
        [2, 0],
        cookie,
        409,
      );
      expect(answer.status).toBe(409);
      expect(answer.body.error).toBe('not-your-match');
    }
    expect((await matchOf(id, alice.id, bob.id)).outcome.kind).toBe(
      'Unreported',
    );
  });

  it('refuses a game score a match can’t end at, saying why', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const match = await matchOf(id, alice.id, bob.id);

    const draw = await reportMatch(id, match.id, aliceCookie, {
      games: [1, 1],
    }).expect(409);
    expect(draw.body.error).toBe('draw');
    const tooMany = await reportMatch(id, match.id, aliceCookie, {
      games: [3, 0],
    }).expect(409);
    expect(tooMany.body.error).toBe('not-best-of-three');
    expect((await matchOf(id, alice.id, bob.id)).outcome.kind).toBe(
      'Unreported',
    );
  });

  it('rejects a body that isn’t a game score', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const match = await matchOf(id, alice.id, bob.id);

    for (const body of [
      {},
      { games: [2] },
      { games: [2, -1] },
      { games: ['2', '0'] },
    ]) {
      const answer = await reportMatch(id, match.id, aliceCookie, body);
      expect(answer.status).toBe(400);
      expect(answer.body.error).toBe('invalid');
    }
  });

  it('answers 404 for a match the tournament doesn’t have', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);

    const answer = await reportMatch(id, 'no-such-match', aliceCookie, {
      games: [2, 0],
    }).expect(404);

    expect(answer.body.error).toBe('no-match');
  });

  it('answers 404 no-match for a bye, even to the player who has it', async () => {
    const cookies = [aliceCookie, bobCookie, carolCookie];
    const id = await playingTournament(cookies, swiss());
    const [bye] = (await tournamentView(id)).rounds[0].byes;
    const cookieOf = await cookiesByPlayer(id, cookies);

    const answer = await reportMatch(id, await byeId(id), cookieOf[bye], {
      games: [2, 0],
    }).expect(404);

    expect(answer.body.error).toBe('no-match');
  });

  it('refuses a match of a completed Swiss tournament round as reported, leaving the tournament round’s game scores as they were', async () => {
    const cookies = [aliceCookie, bobCookie, carolCookie, await signIn(dave)];
    const id = await playingTournament(cookies, swiss());
    const cookieOf = await cookiesByPlayer(id, cookies);
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const [completed] = (await tournamentView(id)).rounds;
    const [match] = completed.matches;

    const answer = await reportMatch(id, match.id, cookieOf[match.players[1]], {
      games: [0, 2],
    }).expect(409);

    expect(answer.body.error).toBe('match-reported');
    expect((await tournamentView(id)).rounds[0]).toEqual(completed);
  });
});

describe('standings', () => {
  it('rank by match points', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [carol.id, alice.id], [2, 1], carolCookie);
    await reportWin(id, [carol.id, bob.id], [2, 0], bobCookie);
    await reportWin(id, [bob.id, alice.id], [2, 0], bobCookie);

    const { standings } = await tournamentView(id);

    expect(standings).toEqual([
      {
        playerId: carol.id,
        rank: 1,
        shared: false,
        matchPoints: 6,
        matches: { won: 2, lost: 0, drawn: 0 },
        games: { won: 4, lost: 1, drawn: 0 },
        gameWinPercent: 80,
      },
      {
        playerId: bob.id,
        rank: 2,
        shared: false,
        matchPoints: 3,
        matches: { won: 1, lost: 1, drawn: 0 },
        games: { won: 2, lost: 2, drawn: 0 },
        gameWinPercent: 50,
      },
      {
        playerId: alice.id,
        rank: 3,
        shared: false,
        matchPoints: 0,
        matches: { won: 0, lost: 2, drawn: 0 },
        games: { won: 1, lost: 4, drawn: 0 },
        gameWinPercent: 20,
      },
    ]);
  });
});

describe('standings places', () => {
  it('say whether each place is shared, as =1st reads', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    // Each beats one other 2–0: all level after every tiebreaker.
    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await reportWin(id, [carol.id, alice.id], [2, 0], carolCookie);
    const tied = (await tournamentView(id)).standings;

    expect(tied.map(({ rank, shared }) => ({ rank, shared }))).toEqual([
      { rank: 1, shared: true },
      { rank: 1, shared: true },
      { rank: 1, shared: true },
    ]);
  });
});

describe('completing a tournament', () => {
  it('turns unreported matches into granted draws, names the trophy holder and unlocks decks', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
    expect(
      (await setBasic(id, 'Island', 1, aliceCookie).expect(409)).body.error,
    ).toBe('deck-locked');
    expect((await tournamentView(id)).completedAt).toBeNull();
    const before = Date.now();

    const answer = await completeTournament(id).expect(200);

    expect(answer.body.tournament).toEqual({ state: 'Complete' });
    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expectCompletedSince(view, before);
    expect((await matchOf(id, alice.id, carol.id)).outcome).toEqual({
      kind: 'GrantedDraw',
    });
    expect((await matchOf(id, bob.id, carol.id)).outcome).toEqual({
      kind: 'GrantedDraw',
    });
    expect((await matchOf(id, alice.id, bob.id)).outcome.kind).toBe(
      'GameScore',
    );
    // Alice 3 + 1, Carol 1 + 1, Bob 0 + 1.
    expect(
      view.standings.map(({ playerId, matchPoints }) => [
        playerId,
        matchPoints,
      ]),
    ).toEqual([
      [alice.id, 4],
      [carol.id, 2],
      [bob.id, 1],
    ]);
    expect(view.trophyHolders).toEqual([alice.id]);
    for (const cookie of [aliceCookie, bobCookie, carolCookie]) {
      await setBasic(id, 'Island', 1, cookie).expect(200);
    }
  });

  it('gives a trophy to each player who shares first', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);

    await completeTournament(id).expect(200);

    const view = await tournamentView(id);
    expect(view.standings.map(({ rank }) => rank)).toEqual([1, 1]);
    expect(view.trophyHolders).toEqual([alice.id, bob.id]);
  });

  it('refuses anyone without the power to organize the draft', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);

    await completeTournament(id, bobCookie).expect(403);

    expect((await tournamentView(id)).state).toBe('Playing');
  });

  it('refuses a tournament that isn’t playing, and reports once it is complete', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await completeTournament(id).expect(200);

    expect((await completeTournament(id).expect(409)).body.error).toBe(
      'not-playing',
    );
    const late = await reportMatch(
      id,
      (await matchOf(id, alice.id, bob.id)).id,
      aliceCookie,
      { games: [2, 0] },
    ).expect(409);
    expect(late.body.error).toBe('not-playing');
  });
});
