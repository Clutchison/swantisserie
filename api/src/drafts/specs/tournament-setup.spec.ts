import type { TournamentView } from 'contract';
import request from 'supertest';
import {
  alice,
  aliceCookie,
  app,
  bob,
  cancelTournament,
  carol,
  completeDraft,
  completeTournament,
  joinedPlayers,
  fullDeck,
  getDraft,
  joinTournament,
  playingTournament,
  readyDraft,
  roundRobin,
  removeEntry,
  reportWin,
  setBasic,
  setUpTournament,
  signIn,
  singleElimination,
  start,
  tournament,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
});

describe('tournament setup', () => {
  it('lets the organizer of a complete draft set up a round robin tournament, in registration with no one joined', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    const answer = await setUpTournament(id).expect(201);

    expect(answer.body.tournament).toEqual({ state: 'Registration' });
    expect((await tournament(id).expect(200)).body).toEqual({
      format: 'RoundRobin',
      swissRoundOption: null,
      publicDecklists: false,
      showsDecklists: false,
      state: 'Registration',
      roundCount: 0,
      lastCompletedRound: 0,
      entries: [],
      rounds: [],
      bracket: null,
      completeRoundGrants: null,
      standingsAwaitCompletedRounds: false,
      reopenRound: null,
      standings: [],
      trophyHolders: [],
      // Alice, who reads it, has yet to fill her deck.
      canJoin: false,
      joinRefusal: expect.objectContaining({ error: 'deck-too-small' }),
    });
    expect((await getDraft(id).expect(200)).body.tournament).toEqual({
      state: 'Registration',
    });
  });

  it('sets up a single elimination tournament, unseeded until it starts', async () => {
    const carolCookie = await signIn(carol);
    const id = await completeDraft([aliceCookie, bobCookie, carolCookie]);

    await setUpTournament(id, aliceCookie, singleElimination).expect(201);
    for (const cookie of [aliceCookie, bobCookie, carolCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }

    const { body } = await tournament(id).expect(200);
    expect(body).toMatchObject({
      format: 'SingleElimination',
      swissRoundOption: null,
      state: 'Registration',
      roundCount: 2,
    });
    expect((body as TournamentView).entries.map((entry) => entry.seed)).toEqual(
      [null, null, null],
    );
  });

  it('sets up a tournament with public decklists, which it reports, though no decklists are shown during registration', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    await setUpTournament(id, aliceCookie, {
      ...roundRobin,
      publicDecklists: true,
    }).expect(201);

    expect((await tournament(id).expect(200)).body).toMatchObject({
      format: 'RoundRobin',
      publicDecklists: true,
      showsDecklists: false,
    });
  });

  it('sets up a tournament without public decklists when asked to', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    await setUpTournament(id, aliceCookie, {
      ...singleElimination,
      publicDecklists: false,
    }).expect(201);

    expect((await tournament(id).expect(200)).body).toMatchObject({
      publicDecklists: false,
      showsDecklists: false,
    });
  });

  it('refuses a public decklists choice that is not yes or no', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    await setUpTournament(id, aliceCookie, {
      ...roundRobin,
      publicDecklists: 'yes',
    }).expect(400);
    await tournament(id).expect(404);
  });

  it('shows a draft with no tournament as having none', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    expect((await getDraft(id).expect(200)).body.tournament).toBeNull();
  });

  it('lets an app admin who is not the organizer set one up', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    await setUpTournament(id, await signIn(carol)).expect(201);
  });

  it('refuses anyone without the power to organize the draft', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    await setUpTournament(id, bobCookie).expect(403);
    expect((await tournament(id).expect(404)).body.error).toBe('no-tournament');
  });

  it('refuses a draft that is not complete', async () => {
    const lobby = await readyDraft([aliceCookie, bobCookie]);
    expect((await setUpTournament(lobby).expect(409)).body.error).toBe(
      'draft-not-complete',
    );
    await start(lobby).expect(200);
    expect((await setUpTournament(lobby).expect(409)).body.error).toBe(
      'draft-not-complete',
    );
  });

  it('refuses a second tournament for the same draft', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);

    expect((await setUpTournament(id).expect(409)).body.error).toBe(
      'tournament-exists',
    );
  });

  it('refuses a format it does not offer', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    await setUpTournament(id, aliceCookie, {
      format: 'DoubleElimination',
    }).expect(400);
    await setUpTournament(id, aliceCookie, {}).expect(400);
    await tournament(id).expect(404);
  });

  it('answers 404 for a draft that does not exist', async () => {
    await setUpTournament('no-such-draft').expect(404);
    await tournament('no-such-draft').expect(404);
  });
});

describe('reading the tournament', () => {
  it('lets everyone who sees the draft read it once it exists, players or not', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    const carolCookie = await signIn(carol);
    const daveCookie = await signIn({ id: '80351110224678915', name: 'Dave' });

    for (const cookie of [aliceCookie, bobCookie, carolCookie, daveCookie]) {
      expect((await tournament(id, cookie).expect(200)).body.state).toBe(
        'Registration',
      );
    }
  });

  it('answers no-tournament, organizer or not, before setup', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    for (const cookie of [aliceCookie, bobCookie]) {
      expect((await tournament(id, cookie).expect(404)).body.error).toBe(
        'no-tournament',
      );
    }
  });
});

describe('cancel tournament', () => {
  it('removes the tournament and its entries during registration, so the organizer can set up again', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    await fullDeck(id, bobCookie);
    await joinTournament(id, bobCookie).expect(201);

    const answer = await cancelTournament(id).expect(200);

    expect(answer.body.tournament).toBeNull();
    await tournament(id).expect(404);
    await setUpTournament(id).expect(201);
    expect(await joinedPlayers(id)).toEqual([]);
  });

  it('removes the tournament and its matches while playing, so nothing counts and every deck unlocks', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(id, [alice.id, bob.id], [2, 0], bobCookie);
    expect(
      (await setBasic(id, 'Island', 1, bobCookie).expect(409)).body.error,
    ).toBe('deck-locked');
    const before = await getDraft(id).expect(200);

    const answer = await cancelTournament(id).expect(200);

    expect(answer.body.tournament).toBeNull();
    expect(answer.body.version).toBe(before.body.version + 1);
    await tournament(id).expect(404);
    for (const cookie of [aliceCookie, bobCookie]) {
      await setBasic(id, 'Island', 1, cookie).expect(200);
    }
    await setUpTournament(id).expect(201);
    expect(await joinedPlayers(id)).toEqual([]);
  });

  it('refuses a complete tournament, whose results are final', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await completeTournament(id).expect(200);

    expect((await cancelTournament(id).expect(409)).body.error).toBe(
      'tournament-complete',
    );
    expect((await tournament(id).expect(200)).body.state).toBe('Complete');
  });

  it('refuses anyone without the power to organize the draft', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);

    await cancelTournament(id, bobCookie).expect(403);
    await tournament(id).expect(200);
  });

  it('answers no-tournament for a draft with none', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    expect((await cancelTournament(id).expect(404)).body.error).toBe(
      'no-tournament',
    );
  });
});

describe('live updates', () => {
  it('bumps the draft’s version with each tournament change', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await fullDeck(id, aliceCookie);
    const versionNow = async () =>
      (await getDraft(id).expect(200)).body.version as number;

    const changes = [
      () => setUpTournament(id).expect(201),
      () => joinTournament(id, aliceCookie).expect(201),
      () => removeEntry(id, alice.id, aliceCookie).expect(200),
      () => cancelTournament(id).expect(200),
    ];
    for (const change of changes) {
      const before = await versionNow();
      const answer = await change();
      expect(answer.body.version).toBe(before + 1);
      expect(await versionNow()).toBe(before + 1);
    }
  });
});

describe('signed out', () => {
  it('is refused every tournament request, read or change', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const routes: ['get' | 'post' | 'put' | 'delete', string][] = [
      ['get', ''],
      ['post', ''],
      ['delete', ''],
      ['post', '/entries'],
      ['delete', `/entries/${bob.id}`],
      ['post', `/entries/${bob.id}/drop`],
      ['delete', `/entries/${bob.id}/drop`],
      ['post', '/start'],
      ['post', '/matches/m/report'],
      ['post', '/matches/m/confirm'],
      ['put', '/matches/m/game-score'],
      ['delete', '/matches/m/game-score'],
      ['post', '/complete'],
      ['post', '/complete-round'],
      ['post', '/reopen-round'],
      ['get', '/decklists'],
    ];
    for (const [method, path] of routes) {
      await request(app.getHttpServer())
        [method](`/api/drafts/${id}/tournament${path}`)
        .expect(401);
    }
  });
});
