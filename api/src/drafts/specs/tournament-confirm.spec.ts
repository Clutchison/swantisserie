import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeRound,
  completeTournament,
  cookiesByPlayer,
  confirmMatch,
  matchOf,
  playingTournament,
  reportCurrentRound,
  reportWin,
  setWin,
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

describe('confirming a match', () => {
  it('lets the opponent of the player who reported a match confirm its game score', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 1], carolCookie);
    const match = await matchOf(id, bob.id, carol.id);

    await confirmMatch(id, match.id, bobCookie).expect(200);

    const confirmed = await matchOf(id, bob.id, carol.id);
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.outcome).toEqual(match.outcome);
    expect(confirmed.reportedBy).toBe(carol.id);
  });

  it('refuses the player who reported it', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 0], bobCookie);
    const match = await matchOf(id, alice.id, bob.id);

    const answer = await confirmMatch(id, match.id, bobCookie).expect(409);

    expect(answer.body.error).toBe('own-report');
    expect((await matchOf(id, alice.id, bob.id)).confirmed).toBe(false);
  });

  it('refuses the draft’s other players and viewers who aren’t players, even organizers', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    const match = await matchOf(id, bob.id, carol.id);
    const daveCookie = await signIn(dave);

    for (const cookie of [aliceCookie, daveCookie]) {
      const answer = await confirmMatch(id, match.id, cookie).expect(409);
      expect(answer.body.error).toBe('not-your-match');
    }
    expect((await matchOf(id, bob.id, carol.id)).confirmed).toBe(false);
  });

  it('refuses a match that isn’t reported', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const match = await matchOf(id, alice.id, bob.id);

    const answer = await confirmMatch(id, match.id, bobCookie).expect(409);

    expect(answer.body.error).toBe('not-reported');
  });

  it('lets either player confirm a game score an organizer who isn’t playing reported', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await setWin(id, [bob.id, carol.id], [2, 1]);
    const match = await matchOf(id, bob.id, carol.id);

    await confirmMatch(id, match.id, carolCookie).expect(200);

    expect((await matchOf(id, bob.id, carol.id)).confirmed).toBe(true);
  });

  it('lets the opponent confirm once the tournament is complete', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
    await completeTournament(id).expect(200);
    const match = await matchOf(id, alice.id, bob.id);

    await confirmMatch(id, match.id, bobCookie).expect(200);

    expect((await matchOf(id, alice.id, bob.id)).confirmed).toBe(true);
  });

  it('lets the opponent confirm a match of a completed Swiss tournament round, changing nothing else in it', async () => {
    const cookies = [aliceCookie, bobCookie, carolCookie, await signIn(dave)];
    const id = await playingTournament(cookies, swiss());
    const cookieOf = await cookiesByPlayer(id, cookies);
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const [completed] = (await tournamentView(id)).rounds;
    const [match, other] = completed.matches;
    expect(match.confirmed).toBe(false);

    await confirmMatch(id, match.id, cookieOf[match.players[1]]).expect(200);

    expect((await tournamentView(id)).rounds[0]).toEqual({
      ...completed,
      matches: [{ ...match, confirmed: true }, other],
    });
  });
});
