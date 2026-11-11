import type { MyStatsView } from 'contract';
import request from 'supertest';
import { OTJ_SETS } from '../../testing/scryfall-sets.js';
import {
  alice,
  aliceCookie,
  app,
  bob,
  carol,
  cancelTournament,
  completeDraft,
  completeDraftWithBots,
  completeRound,
  completeTournament,
  drawnFrom,
  dropPlayer,
  fullDeck,
  playingTournament,
  reportWin,
  scryfall,
  seedsOf,
  setUpTournament,
  setWin,
  signIn,
  singleElimination,
  startTournament,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
});

/** My stats as whoever `cookie` signs in reads them. */
async function myStats(cookie = aliceCookie): Promise<MyStatsView> {
  const res = await request(app.getHttpServer())
    .get('/api/my-stats')
    .set('Cookie', cookie)
    .expect(200);
  return res.body as MyStatsView;
}

const tally = (won: number, lost: number, drawn = 0) => ({ won, lost, drawn });

describe('My stats', () => {
  it('gives the signed-in player’s numbers over complete tournaments of every format', async () => {
    const roundRobin = await playingTournament([
      aliceCookie,
      bobCookie,
      carolCookie,
    ]);
    await reportWin(roundRobin, [alice.id, bob.id], [2, 1], aliceCookie);
    await reportWin(roundRobin, [alice.id, carol.id], [2, 0], aliceCookie);
    await reportWin(roundRobin, [bob.id, carol.id], [2, 1], bobCookie);
    await completeTournament(roundRobin).expect(200);

    const bracket = await playingTournament(
      [aliceCookie, bobCookie],
      singleElimination,
    );
    await reportWin(bracket, [bob.id, alice.id], [2, 0], bobCookie);
    await completeRound(bracket).expect(200);

    const swissId = await playingTournament([bobCookie, carolCookie], swiss());
    await reportWin(swissId, [carol.id, bob.id], [2, 0], carolCookie);
    await completeRound(swissId).expect(200);

    const stats = await myStats();

    expect(stats).toMatchObject({
      tournamentsPlayed: 2,
      trophies: 1,
      trophyRate: 50,
      matches: tally(2, 1),
      games: tally(4, 3),
      bestFinish: { rank: 1, shared: false },
    });
    expect(stats.matchWinRate).toBeCloseTo(66.67, 2);
    expect(stats.gameWinRate).toBeCloseTo(57.14, 2);
  });

  it('lists each complete tournament the player joined, newest first, with its draft, pool source and completion time', async () => {
    const first = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(first, [alice.id, bob.id], [2, 1], aliceCookie);
    await completeTournament(first).expect(200);
    const second = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(second, [bob.id, alice.id], [2, 0], bobCookie);
    await completeTournament(second).expect(200);
    const firstView = await tournamentView(first);
    const secondView = await tournamentView(second);

    const { results } = await myStats();

    expect(results).toEqual([
      {
        draftId: second,
        draftName: 'Red',
        poolSource: { kind: 'pool-query', poolQuery: 'c:r' },
        completedAt: secondView.completedAt,
        place: { rank: 2, shared: false },
        matches: tally(0, 1),
        trophy: false,
      },
      {
        draftId: first,
        draftName: 'Red',
        poolSource: { kind: 'pool-query', poolQuery: 'c:r' },
        completedAt: firstView.completedAt,
        place: { rank: 1, shared: false },
        matches: tally(1, 0),
        trophy: true,
      },
    ]);
  });

  it('names a result’s sets, and gives its cube’s name and link, as the Trophy Hall does', async () => {
    scryfall.sets.mockResolvedValue(OTJ_SETS);
    const sets = await playingTournament([aliceCookie, bobCookie]);
    await drawnFrom(sets, { setList: [{ code: 'otj', sublists: ['big'] }] });
    await completeTournament(sets).expect(200);
    const cube = await playingTournament([aliceCookie, bobCookie]);
    await drawnFrom(cube, { cube: { id: 'vintage', name: 'Vintage Cube' } });
    await completeTournament(cube).expect(200);

    const { results } = await myStats();

    expect(results.map((result) => result.poolSource)).toEqual([
      {
        kind: 'cube',
        cube: {
          name: 'Vintage Cube',
          url: 'https://cubecobra.com/cube/overview/vintage',
        },
      },
      {
        kind: 'set-list',
        setList: [
          {
            code: 'otj',
            name: 'Outlaws of Thunder Junction',
            sublists: [{ code: 'big', name: 'The Big Score' }],
          },
        ],
      },
    ]);
  });

  it('names a set by its code when Scryfall can’t name it', async () => {
    scryfall.sets.mockRejectedValue(new Error('Scryfall is down'));
    const id = await playingTournament([aliceCookie, bobCookie]);
    await drawnFrom(id, { setList: [{ code: 'otj', sublists: [] }] });
    await completeTournament(id).expect(200);

    const [result] = (await myStats()).results;

    expect(result.poolSource).toEqual({
      kind: 'set-list',
      setList: [{ code: 'otj', name: 'OTJ', sublists: [] }],
    });
  });

  it('gives only the signed-in player’s own stats', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(id, [bob.id, alice.id], [2, 0], bobCookie);
    await completeTournament(id).expect(200);

    expect(await myStats(bobCookie)).toMatchObject({
      trophies: 1,
      matches: tally(1, 0),
    });
    expect(await myStats(aliceCookie)).toMatchObject({
      trophies: 0,
      matches: tally(0, 1),
    });
    const carols = await myStats(carolCookie);
    expect(carols.tournamentsPlayed).toBe(0);
    expect(carols.results).toEqual([]);
  });

  it('shows a shared place as shared, and counts a shared trophy as a whole one', async () => {
    // Each beats one other 2–0: level on everything, so all three share first.
    const tied = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(tied, [alice.id, bob.id], [2, 0], aliceCookie);
    await reportWin(tied, [bob.id, carol.id], [2, 0], bobCookie);
    await reportWin(tied, [carol.id, alice.id], [2, 0], carolCookie);
    await completeTournament(tied).expect(200);
    expect((await tournamentView(tied)).trophyHolders).toHaveLength(3);

    const stats = await myStats();

    expect(stats).toMatchObject({
      tournamentsPlayed: 1,
      trophies: 1,
      trophyRate: 100,
      bestFinish: { rank: 1, shared: true },
    });
    expect(stats.results[0]).toMatchObject({
      place: { rank: 1, shared: true },
      trophy: true,
    });
  });

  it('counts played matches only in its records and win rates, but gives each result its standings record', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 1], aliceCookie);
    // Bob's match with Carol becomes a forfeit; Alice's with Carol a granted draw.
    await dropPlayer(id, bob.id, bobCookie).expect(200);
    await completeTournament(id).expect(200);
    // Each player's played matches in that round robin.
    const played = {
      [alice.id]: { matches: tally(1, 0), games: tally(2, 1) },
      [bob.id]: { matches: tally(0, 1), games: tally(1, 2) },
      [carol.id]: { matches: tally(0, 0), games: tally(0, 0) },
    };

    const bracket = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      singleElimination,
    );
    const [top, second, third] = seedsOf(await tournamentView(bracket));
    await setWin(bracket, [second, third], [2, 0]);
    await completeRound(bracket).expect(200);
    const [final] = (await tournamentView(bracket)).rounds[1].matches;
    await completeRound(bracket, aliceCookie, {
      grantedWins: [{ matchId: final.id, winner: top }],
    }).expect(200);
    expect((await tournamentView(bracket)).state).toBe('Complete');
    const cookieOf = {
      [alice.id]: aliceCookie,
      [bob.id]: bobCookie,
      [carol.id]: carolCookie,
    };

    // The top seed had a bye, then a granted win: no played match in the
    // bracket, though its standings count both as won.
    const stats = await myStats(cookieOf[top]);

    expect(stats).toMatchObject(played[top]);
    expect(stats.results[0]).toMatchObject({
      draftId: bracket,
      place: { rank: 1, shared: false },
      matches: tally(2, 0),
      trophy: true,
    });
    const aliceStats = await myStats();
    expect(aliceStats.results[1].matches).toEqual(tally(1, 0, 1));
  });

  it('leaves out tournaments a bot played in, cancelled ones and ones not complete', async () => {
    const { id: withBot, botIds } = await completeDraftWithBots(
      [aliceCookie, bobCookie],
      1,
    );
    for (const cookie of [aliceCookie, bobCookie]) {
      await fullDeck(withBot, cookie);
    }
    await setUpTournament(withBot).expect(201);
    await startTournament(withBot).expect(200);
    await reportWin(withBot, [alice.id, bob.id], [2, 0], aliceCookie);
    await reportWin(withBot, [alice.id, botIds[0]], [2, 0], aliceCookie);
    await reportWin(withBot, [bob.id, botIds[0]], [2, 0], bobCookie);
    await completeTournament(withBot).expect(200);

    const cancelled = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(cancelled, [alice.id, bob.id], [2, 0], aliceCookie);
    await cancelTournament(cancelled).expect(200);
    const playing = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(playing, [alice.id, bob.id], [2, 0], aliceCookie);
    const registering = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(registering).expect(201);

    expect(await myStats()).toEqual({
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

  it('is only for signed-in users', async () => {
    await request(app.getHttpServer()).get('/api/my-stats').expect(401);
  });
});
