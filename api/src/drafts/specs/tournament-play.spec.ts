import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeTournament,
  getDraft,
  matchOf,
  playingTournament,
  reportMatch,
  reportWin,
  setBasic,
  signIn,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A fourth player, who signs in only where a spec needs four. */
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

  it('refuses a draw, and a game score a best-of-three match never ends at', async () => {
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

  it('bumps the draft’s version', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const before = await getDraft(id).expect(200);

    const answer = await reportWin(id, [alice.id, bob.id], [2, 0], bobCookie);

    expect(answer.status).toBe(200);
    expect(answer.body.version).toBe(before.body.version + 1);
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
        matchPoints: 6,
        matches: { won: 2, lost: 0, drawn: 0 },
        games: { won: 4, lost: 1, drawn: 0 },
        gameWinRate: 0.8,
      },
      {
        playerId: bob.id,
        rank: 2,
        matchPoints: 3,
        matches: { won: 1, lost: 1, drawn: 0 },
        games: { won: 2, lost: 2, drawn: 0 },
        gameWinRate: 0.5,
      },
      {
        playerId: alice.id,
        rank: 3,
        matchPoints: 0,
        matches: { won: 0, lost: 2, drawn: 0 },
        games: { won: 1, lost: 4, drawn: 0 },
        gameWinRate: 0.2,
      },
    ]);
  });

  it('fall back to game-win % when match points and head-to-head leave players tied', async () => {
    // Each beat one of the others, so all three have 3 match points, 3 among themselves.
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 1], aliceCookie);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await reportWin(id, [carol.id, alice.id], [2, 0], carolCookie);

    const { standings } = await tournamentView(id);

    expect(standings.map(({ playerId, rank }) => [playerId, rank])).toEqual([
      [bob.id, 1],
      [carol.id, 2],
      [alice.id, 3],
    ]);
  });

  it('break a two-player tie by head-to-head before game-win %', async () => {
    // Alice and Bob have 6 match points each, and so do Carol and Dave with 3.
    // Bob has the better game-win %, but Alice beat him; Carol beat Dave.
    const daveCookie = await signIn(dave);
    const id = await playingTournament([
      aliceCookie,
      bobCookie,
      carolCookie,
      daveCookie,
    ]);
    await reportWin(id, [alice.id, bob.id], [2, 1], aliceCookie);
    await reportWin(id, [alice.id, carol.id], [2, 1], aliceCookie);
    await reportWin(id, [dave.id, alice.id], [2, 1], daveCookie);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await reportWin(id, [bob.id, dave.id], [2, 0], bobCookie);
    await reportWin(id, [carol.id, dave.id], [2, 0], carolCookie);

    const { standings } = await tournamentView(id);

    expect(standings.map(({ playerId, rank }) => [playerId, rank])).toEqual([
      [alice.id, 1],
      [bob.id, 2],
      [carol.id, 3],
      [dave.id, 4],
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

    const answer = await completeTournament(id).expect(200);

    expect(answer.body.tournament).toEqual({ state: 'Complete' });
    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
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

  it('bumps the draft’s version', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const before = await getDraft(id).expect(200);

    const answer = await completeTournament(id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});
