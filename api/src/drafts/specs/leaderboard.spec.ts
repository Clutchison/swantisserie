import type { LeaderboardView } from 'contract';
import request from 'supertest';
import {
  addBot,
  alice,
  aliceCookie,
  app,
  bob,
  carol,
  cancelTournament,
  completeDraft,
  completeRound,
  completeTournament,
  dropPlayer,
  fullDeck,
  getDraft,
  joinTournament,
  pick,
  playingTournament,
  poolCardIds,
  readyDraft,
  reportWin,
  setUpTournament,
  setWin,
  signIn,
  singleElimination,
  start,
  startTournament,
  swiss,
  tournamentView,
  useDraftsApp,
  waitForBotPicks,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
});

/** The leaderboard as whoever `cookie` signs in reads it. */
async function leaderboard(cookie = aliceCookie): Promise<LeaderboardView> {
  const res = await request(app.getHttpServer())
    .get('/api/leaderboard')
    .set('Cookie', cookie)
    .expect(200);
  return res.body as LeaderboardView;
}

const tally = (won: number, lost: number, drawn = 0) => ({ won, lost, drawn });

describe('the leaderboard', () => {
  it('counts trophies, tournaments played and match and game records over complete tournaments of every format', async () => {
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
    for (const id of [bracket, swissId]) {
      expect((await tournamentView(id)).state).toBe('Complete');
    }

    const board = await leaderboard();

    expect(board).toMatchObject([
      {
        playerId: alice.id,
        name: 'Alice',
        trophies: 1,
        tournamentsPlayed: 2,
        matches: tally(2, 1),
        games: tally(4, 3),
      },
      {
        playerId: bob.id,
        name: 'Bob',
        trophies: 1,
        tournamentsPlayed: 3,
        matches: tally(2, 2),
        games: tally(5, 5),
      },
      {
        playerId: carol.id,
        name: 'Carol',
        trophies: 1,
        tournamentsPlayed: 2,
        matches: tally(1, 2),
        games: tally(3, 4),
      },
    ]);
  });

  it('gives each player’s head-to-head record against each opponent', async () => {
    for (const games of [
      [2, 1],
      [0, 2],
      [2, 0],
    ] as [number, number][]) {
      const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
      await reportWin(id, [alice.id, bob.id], games, aliceCookie);
      await reportWin(id, [carol.id, alice.id], [2, 1], carolCookie);
      await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
      await completeTournament(id).expect(200);
    }

    const board = await leaderboard();

    const bobs = board.find((entry) => entry.playerId === bob.id)!;
    expect(bobs.opponents).toEqual(
      expect.arrayContaining([
        {
          playerId: alice.id,
          matches: tally(1, 2),
          games: tally(3, 4),
        },
        {
          playerId: carol.id,
          matches: tally(3, 0),
          games: tally(6, 0),
        },
      ]),
    );
    expect(bobs.opponents).toHaveLength(2);
  });

  it('leaves forfeits, granted draws and byes out of records, and players with no played match off it', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 1], aliceCookie);
    // Bob's match with Carol becomes a forfeit; Alice's becomes a granted draw.
    await dropPlayer(id, bob.id, bobCookie).expect(200);
    await completeTournament(id).expect(200);

    expect(await leaderboard()).toEqual([
      {
        playerId: alice.id,
        name: 'Alice',
        trophies: 1,
        tournamentsPlayed: 1,
        matches: tally(1, 0),
        games: tally(2, 1),
        opponents: [
          { playerId: bob.id, matches: tally(1, 0), games: tally(2, 1) },
        ],
      },
      {
        playerId: bob.id,
        name: 'Bob',
        trophies: 0,
        tournamentsPlayed: 1,
        matches: tally(0, 1),
        games: tally(1, 2),
        opponents: [
          { playerId: alice.id, matches: tally(0, 1), games: tally(1, 2) },
        ],
      },
    ]);
  });

  it('leaves out tournaments still in registration or playing, and cancelled ones', async () => {
    const complete = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(complete, [bob.id, alice.id], [2, 0], bobCookie);
    await completeTournament(complete).expect(200);
    const playing = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(playing, [alice.id, bob.id], [2, 0], aliceCookie);
    const cancelled = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(cancelled, [alice.id, bob.id], [2, 0], aliceCookie);
    await cancelTournament(cancelled).expect(200);
    const registering = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(registering).expect(201);
    for (const cookie of [aliceCookie, bobCookie]) {
      await fullDeck(registering, cookie);
      await joinTournament(registering, cookie).expect(201);
    }

    const board = await leaderboard();

    expect(
      board.map(({ name, tournamentsPlayed, matches }) => ({
        name,
        tournamentsPlayed,
        matches,
      })),
    ).toEqual([
      { name: 'Bob', tournamentsPlayed: 1, matches: tally(1, 0) },
      { name: 'Alice', tournamentsPlayed: 1, matches: tally(0, 1) },
    ]);
  });

  it('never lists bots', async () => {
    const id = await readyDraft([aliceCookie, bobCookie]);
    await addBot(id, carolCookie).expect(201);
    await start(id).expect(200);
    const ids = await poolCardIds(id);
    await pick(id, ids.Shock, aliceCookie).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await waitForBotPicks(1, async () => {
      expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
    });
    await setUpTournament(id).expect(201);
    for (const cookie of [aliceCookie, bobCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }
    await startTournament(id).expect(200);
    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
    await completeTournament(id).expect(200);

    const board = await leaderboard();

    expect(board.map((entry) => entry.name)).toEqual(['Alice', 'Bob']);
  });

  it('moves a trophy when a match is corrected after completion', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
    await completeTournament(id).expect(200);

    await setWin(id, [bob.id, alice.id], [2, 1]);

    const board = await leaderboard();
    expect(
      board.map(({ name, trophies, matches }) => ({ name, trophies, matches })),
    ).toEqual([
      { name: 'Bob', trophies: 1, matches: tally(1, 0) },
      { name: 'Alice', trophies: 0, matches: tally(0, 1) },
    ]);
  });

  it('is only for signed-in users', async () => {
    await request(app.getHttpServer()).get('/api/leaderboard').expect(401);
  });
});
