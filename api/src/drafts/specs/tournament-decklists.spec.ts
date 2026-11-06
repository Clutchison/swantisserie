import type { DecklistView, PlanView, TournamentSetupRequest } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  completeTournament,
  dropPlayer,
  draftsRequest,
  fullDeck,
  joinTournament,
  movePlanned,
  plan,
  playingTournament,
  poolCardIds,
  roundRobin,
  setBasic,
  setUpTournament,
  signIn,
  startTournament,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** Reads the draft's decklists, as whoever `cookie` signs in. */
function decklists(id: string, cookie = aliceCookie) {
  return draftsRequest('get', `/${id}/tournament/decklists`, cookie);
}

/** The setup `base` asks for, with public decklists. */
function withPublicDecklists(
  base: TournamentSetupRequest = roundRobin,
): TournamentSetupRequest {
  return { ...base, publicDecklists: true };
}

/** A player's locked deck as the plan read gives it, without its plan notice. */
async function deckOf(id: string, cookie: string) {
  const { mainboard, sideboard, basics } = (await plan(id, cookie).expect(200))
    .body as PlanView;
  return { mainboard, sideboard, basics };
}

const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;
let daveCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  daveCookie = await signIn(dave);
});

describe('decklists under public decklists', () => {
  it('serves each joined player’s locked deck, in join order, to everyone who sees the draft once it is playing', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    const ids = await poolCardIds(id);
    await setUpTournament(id, aliceCookie, withPublicDecklists()).expect(201);
    await fullDeck(id, bobCookie);
    await movePlanned(id, ids['Lightning Bolt'], 'Sideboard', bobCookie).expect(
      200,
    );
    await setBasic(id, 'Mountain', 40, bobCookie).expect(200);
    await joinTournament(id, bobCookie).expect(201);
    await fullDeck(id, aliceCookie);
    await joinTournament(id, aliceCookie).expect(201);
    const bobDeck = await deckOf(id, bobCookie);
    const aliceDeck = await deckOf(id, aliceCookie);

    await startTournament(id).expect(200);

    expect((await tournamentView(id)).showsDecklists).toBe(true);
    const expected: DecklistView[] = [
      { playerId: bob.id, ...bobDeck },
      { playerId: alice.id, ...aliceDeck },
    ];
    expect(bobDeck).toEqual({
      mainboard: [],
      sideboard: [
        {
          poolCardId: ids['Lightning Bolt'],
          name: 'Lightning Bolt',
          picked: true,
        },
      ],
      basics: [{ land: 'Mountain', count: 40 }],
    });
    for (const cookie of [aliceCookie, bobCookie, carolCookie, daveCookie]) {
      expect((await decklists(id, cookie).expect(200)).body).toEqual(expected);
    }
  });

  it('still serves a dropped player’s decklist', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      withPublicDecklists(),
    );

    await dropPlayer(id, bob.id, bobCookie).expect(200);

    const served = (await decklists(id, daveCookie).expect(200))
      .body as DecklistView[];
    expect(served.map((decklist) => decklist.playerId)).toEqual([
      alice.id,
      bob.id,
      carol.id,
    ]);
  });

  it('refuses them during registration, even to the organizer', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id, aliceCookie, withPublicDecklists()).expect(201);
    await fullDeck(id, bobCookie);
    await joinTournament(id, bobCookie).expect(201);

    for (const cookie of [aliceCookie, bobCookie, carolCookie]) {
      expect((await decklists(id, cookie).expect(409)).body.error).toBe(
        'in-registration',
      );
    }
  });

  it('still serves the decks as they were locked once the tournament is complete and they unlock', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie],
      withPublicDecklists(),
    );
    const before = (await decklists(id).expect(200)).body as DecklistView[];

    await completeTournament(id).expect(200);
    await setBasic(id, 'Island', 5, bobCookie).expect(200);

    expect((await tournamentView(id)).showsDecklists).toBe(true);
    expect((await decklists(id, daveCookie).expect(200)).body).toEqual(before);
    expect(before.map((decklist) => decklist.basics)).toEqual([
      [{ land: 'Mountain', count: 39 }],
      [{ land: 'Mountain', count: 39 }],
    ]);
  });

  it('never serves the deck of a player who did not join', async () => {
    const id = await completeDraft([aliceCookie, bobCookie, carolCookie]);
    await setUpTournament(id, aliceCookie, withPublicDecklists(swiss())).expect(
      201,
    );
    for (const cookie of [aliceCookie, carolCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }
    await fullDeck(id, bobCookie);
    await startTournament(id).expect(200);

    const served = (await decklists(id, bobCookie).expect(200))
      .body as DecklistView[];
    expect(served.map((decklist) => decklist.playerId)).toEqual([
      alice.id,
      carol.id,
    ]);
  });

  it('serves them read-only: nothing can be written through this path', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie],
      withPublicDecklists(),
    );
    const before = (await decklists(id).expect(200)).body as DecklistView[];

    for (const method of ['post', 'put', 'delete'] as const) {
      await draftsRequest(method, `/${id}/tournament/decklists`, aliceCookie, {
        mainboard: [],
      }).expect(404);
    }
    expect((await decklists(id).expect(200)).body).toEqual(before);
  });
});

describe('decklists without public decklists', () => {
  it('never serves them, to players, the organizer or an app admin, while playing or once complete', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    expect((await tournamentView(id)).showsDecklists).toBe(false);

    for (const cookie of [aliceCookie, bobCookie, carolCookie, daveCookie]) {
      expect((await decklists(id, cookie).expect(409)).body.error).toBe(
        'decklists-private',
      );
    }
    await completeTournament(id).expect(200);
    for (const cookie of [aliceCookie, carolCookie]) {
      expect((await decklists(id, cookie).expect(409)).body.error).toBe(
        'decklists-private',
      );
    }
  });

  it('answers no-tournament for a draft without one', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    expect((await decklists(id).expect(404)).body.error).toBe('no-tournament');
  });
});
