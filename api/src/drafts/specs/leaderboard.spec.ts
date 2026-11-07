import type { CompleteRoundRequest, LeaderboardView } from 'contract';
import request from 'supertest';
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
  dropPlayer,
  fullDeck,
  joinTournament,
  playingSingleElimination,
  playingTournament,
  reopenRound,
  reportWin,
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

  it('leaves forfeits, granted draws and granted wins out of records, and players with no played match off it', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 1], aliceCookie);
    // Bob's match with Carol becomes a forfeit; Alice's becomes a granted draw.
    await dropPlayer(id, bob.id, bobCookie).expect(200);
    await completeTournament(id).expect(200);
    // Alice wins a single elimination final against Bob as a granted win.
    const bracket = await playingTournament(
      [aliceCookie, bobCookie],
      singleElimination,
    );
    const [final] = (await tournamentView(bracket)).rounds[0].matches;
    await completeRound(bracket, aliceCookie, {
      grantedWins: [{ matchId: final.id, winner: alice.id }],
    } satisfies CompleteRoundRequest).expect(200);

    expect(await leaderboard()).toEqual([
      {
        playerId: alice.id,
        name: 'Alice',
        trophies: 2,
        tournamentsPlayed: 2,
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
        tournamentsPlayed: 2,
        matches: tally(0, 1),
        games: tally(1, 2),
        opponents: [
          { playerId: alice.id, matches: tally(0, 1), games: tally(1, 2) },
        ],
      },
    ]);
  });

  it('leaves byes out of records', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      singleElimination,
    );
    const before = await tournamentView(id);
    const [top, second, third] = seedsOf(before);
    expect(before.rounds[0].byes).toEqual([top]);
    await setWin(id, [second, third], [2, 0]);
    await completeRound(id).expect(200);
    await setWin(id, [top, second], [2, 1]);
    await completeRound(id).expect(200);
    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    // The tournament's own standings count the bye as a won match.
    expect(
      view.standings.find((standing) => standing.playerId === top)?.matches,
    ).toEqual(tally(2, 0));

    const board = await leaderboard();

    expect(board).toEqual([
      expect.objectContaining({
        playerId: top,
        trophies: 1,
        matches: tally(1, 0),
        games: tally(2, 1),
        opponents: [
          { playerId: second, matches: tally(1, 0), games: tally(2, 1) },
        ],
      }),
      expect.objectContaining({ playerId: second, matches: tally(1, 1) }),
      expect.objectContaining({ playerId: third, matches: tally(0, 1) }),
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

  it('leaves out every match and trophy of a complete tournament a bot played in, and still counts one without', async () => {
    const { id: withBot, botIds } = await completeDraftWithBots(
      [aliceCookie, bobCookie],
      1,
    );
    await setUpTournament(withBot).expect(201);
    for (const cookie of [aliceCookie, bobCookie]) {
      await fullDeck(withBot, cookie);
      await joinTournament(withBot, cookie).expect(201);
    }
    await startTournament(withBot).expect(200);
    await reportWin(withBot, [alice.id, bob.id], [2, 0], aliceCookie);
    await reportWin(withBot, [alice.id, botIds[0]], [2, 0], aliceCookie);
    await reportWin(withBot, [bob.id, botIds[0]], [2, 0], bobCookie);
    await completeTournament(withBot).expect(200);
    expect((await tournamentView(withBot)).trophyHolders).toEqual([alice.id]);

    const without = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(without, [bob.id, alice.id], [2, 1], bobCookie);
    await completeTournament(without).expect(200);

    const board = await leaderboard();

    expect(
      board.map(
        ({ name, trophies, tournamentsPlayed, matches, opponents }) => ({
          name,
          trophies,
          tournamentsPlayed,
          matches,
          opponents: opponents.map((o) => [o.playerId, o.matches]),
        }),
      ),
    ).toEqual([
      {
        name: 'Bob',
        trophies: 1,
        tournamentsPlayed: 1,
        matches: tally(1, 0),
        opponents: [[alice.id, tally(1, 0)]],
      },
      {
        name: 'Alice',
        trophies: 0,
        tournamentsPlayed: 1,
        matches: tally(0, 1),
        opponents: [[bob.id, tally(0, 1)]],
      },
    ]);
  });

  it('counts only the game score a reopened tournament round was completed again with', async () => {
    const daveCookie = await signIn({ id: '80351110224678915', name: 'Dave' });
    const { id, seeds } = await playingSingleElimination([
      aliceCookie,
      bobCookie,
      carolCookie,
      daveCookie,
    ]);
    const [first, second, third, fourth] = seeds;
    await setWin(id, [first, fourth], [2, 0]);
    await setWin(id, [second, third], [2, 0]);
    await completeRound(id).expect(200);
    await reopenRound(id).expect(200);
    // The fourth seed now beats the first instead, and goes on to win.
    await setWin(id, [fourth, first], [2, 1]);
    await completeRound(id).expect(200);
    await setWin(id, [fourth, second], [2, 0]);
    await completeRound(id).expect(200);
    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.trophyHolders).toEqual([fourth]);

    const board = await leaderboard();

    const byPlayer = Object.fromEntries(
      board.map(
        ({
          playerId,
          trophies,
          tournamentsPlayed,
          matches,
          games,
          opponents,
        }) => [
          playerId,
          { trophies, tournamentsPlayed, matches, games, opponents },
        ],
      ),
    );
    expect(byPlayer).toEqual({
      [fourth]: {
        trophies: 1,
        tournamentsPlayed: 1,
        matches: tally(2, 0),
        games: tally(4, 1),
        opponents: [
          { playerId: second, matches: tally(1, 0), games: tally(2, 0) },
          { playerId: first, matches: tally(1, 0), games: tally(2, 1) },
        ],
      },
      [first]: {
        trophies: 0,
        tournamentsPlayed: 1,
        matches: tally(0, 1),
        games: tally(1, 2),
        opponents: [
          { playerId: fourth, matches: tally(0, 1), games: tally(1, 2) },
        ],
      },
      [second]: {
        trophies: 0,
        tournamentsPlayed: 1,
        matches: tally(1, 1),
        games: tally(2, 2),
        opponents: [
          { playerId: fourth, matches: tally(0, 1), games: tally(0, 2) },
          { playerId: third, matches: tally(1, 0), games: tally(2, 0) },
        ],
      },
      [third]: {
        trophies: 0,
        tournamentsPlayed: 1,
        matches: tally(0, 1),
        games: tally(0, 2),
        opponents: [
          { playerId: second, matches: tally(0, 1), games: tally(0, 2) },
        ],
      },
    });
  });

  it('is only for signed-in users', async () => {
    await request(app.getHttpServer()).get('/api/leaderboard').expect(401);
  });
});
