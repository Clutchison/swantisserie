import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { AdminConfig } from '../auth/admin-config.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ScryfallCard,
  ScryfallClient,
  ScryfallRejectedSearchError,
  ScryfallSearchPage,
  ScryfallUnavailableError,
} from '../scryfall/scryfall-client.js';
import { startTestDatabase, TestDatabase } from '../testing/test-database.js';

const alice = { id: '80351110224678912', name: 'Alice' };
const bob = { id: '80351110224678913', name: 'Bob' };
const carol = { id: '80351110224678914', name: 'Carol' };
/** Carol is an app admin. */
const admins = new AdminConfig(carol.id);

describe('drafts', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  /** `session=<token>` for Alice, ready for a Cookie header. */
  let aliceCookie: string;
  const scryfall = { search: vi.fn<ScryfallClient['search']>() };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
  });

  afterAll(async () => {
    await database.stop();
  });

  async function startApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register({ webRoot: import.meta.dirname })],
    })
      .overrideProvider(ScryfallClient)
      .useValue(scryfall)
      .overrideProvider(AdminConfig)
      .useValue(admins)
      .compile();

    const started = configureApp(moduleRef.createNestApplication());
    await started.init();
    return started;
  }

  /** Signing in through Discord is covered by the auth tests. */
  async function signIn(user: { id: string; name: string; avatar?: string }) {
    await app.get(PrismaService).user.upsert({
      where: { id: user.id },
      create: user,
      update: {},
    });
    const { token } = await app.get(SessionService).create(user.id);
    return `session=${token}`;
  }

  beforeEach(async () => {
    await database.reset();
    vi.resetAllMocks();
    app = await startApp();
    aliceCookie = await signIn(alice);
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Answers searches from `results`, keyed by the exact query sent, with
   * ` page 2` etc. appended for pages after the first.
   */
  function scryfallAnswers(
    results: Record<string, ScryfallSearchPage | null | Error>,
  ) {
    scryfall.search.mockImplementation(async (query, page = 1) => {
      const key = page === 1 ? query : `${query} page ${page}`;
      if (!(key in results)) throw new Error(`Unexpected search: ${key}`);
      const result = results[key];
      if (result instanceof Error) throw result;
      return result;
    });
  }

  /** A single-faced Scryfall card object with the fields we use. */
  function card(
    name: string,
    fields: Partial<ScryfallCard> = {},
  ): ScryfallCard {
    const slug = name.toLowerCase().replace(/\W+/g, '-');
    return {
      id: `${slug}-id`,
      oracle_id: `${slug}-oracle`,
      name,
      set: 'ima',
      collector_number: '1',
      type_line: 'Creature — Dragon',
      colors: ['R'],
      cmc: 7,
      image_uris: {
        small: `https://cards.scryfall.io/small/${slug}.jpg`,
        normal: `https://cards.scryfall.io/normal/${slug}.jpg`,
        large: `https://cards.scryfall.io/large/${slug}.jpg`,
      },
      ...fields,
    };
  }

  function page(...names: string[]): ScryfallSearchPage {
    return {
      totalCards: names.length,
      hasMore: false,
      cards: names.map((name) => card(name)),
      warnings: [],
    };
  }

  /** The search the snapshot pages through for `poolQuery`. */
  const snapshotQuery = (poolQuery: string) =>
    `(${poolQuery}) game:arena unique:cards`;

  /** A pool query whose cards are all on Arena, with a two-card pool. */
  function allOnArena(poolQuery: string) {
    scryfallAnswers({
      [poolQuery]: page('Balefire Dragon', 'Shivan Dragon'),
      [`(${poolQuery}) -in:arena`]: null,
      [snapshotQuery(poolQuery)]: page('Balefire Dragon', 'Shivan Dragon'),
    });
  }

  function createDraft(body: object, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post('/api/drafts')
      .set('Cookie', cookie)
      .send(body);
  }

  function listDrafts(cookie = aliceCookie) {
    return request(app.getHttpServer())
      .get('/api/drafts')
      .set('Cookie', cookie);
  }

  function getDraft(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .get(`/api/drafts/${id}`)
      .set('Cookie', cookie);
  }

  /** The draft once its snapshot has finished, one way or the other. */
  async function snapshotted(id: string) {
    return vi.waitFor(async () => {
      const res = await getDraft(id).expect(200);
      expect(res.body.snapshot.state).not.toBe('Running');
      return res.body;
    });
  }

  it('creates a draft in Lobby with the signed-in role-holder as organizer', async () => {
    allOnArena('t:dragon c:r');

    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      picksPerPlayer: 30,
    }).expect(201);

    const draft = {
      id: expect.any(String),
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      picksPerPlayer: 30,
      state: 'Lobby',
      organizer: alice,
      snapshot: expect.any(Object),
      players: [],
      turn: null,
      createdAt: expect.any(String),
    };
    expect(created.body).toEqual(draft);
    const list = await listDrafts().expect(200);
    expect(list.body).toEqual([{ ...draft, id: created.body.id }]);
  });

  describe('pool snapshot', () => {
    it('pages through the pool after creation, and the draft shows progress then the pool size', async () => {
      const query = snapshotQuery('t:dragon c:r');
      scryfallAnswers({
        't:dragon c:r': page('Balefire Dragon'),
        '(t:dragon c:r) -in:arena': null,
        [query]: { ...page('Balefire Dragon'), totalCards: 2, hasMore: true },
        [`${query} page 2`]: { ...page('Shivan Dragon'), totalCards: 2 },
      });

      const created = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
      }).expect(201);

      expect(created.body.snapshot).toEqual({
        state: 'Running',
        cards: 0,
        total: null,
      });
      const draft = await snapshotted(created.body.id);
      expect(draft.snapshot).toEqual({ state: 'Complete', cards: 2, total: 2 });
      expect(scryfall.search).toHaveBeenCalledWith(query, 1);
      expect(scryfall.search).toHaveBeenCalledWith(query, 2);
    });

    it('stores an image per face of a double-faced card, and its colors from the faces', async () => {
      const query = snapshotQuery('t:dragon');
      const face = (name: string, color: string) => ({
        name,
        colors: [color],
        image_uris: {
          small: `https://cards.scryfall.io/small/${name}.jpg`,
          normal: `https://cards.scryfall.io/normal/${name}.jpg`,
          large: `https://cards.scryfall.io/large/${name}.jpg`,
          png: `https://cards.scryfall.io/png/${name}.png`,
        },
      });
      scryfallAnswers({
        't:dragon': page('Balefire Dragon'),
        '(t:dragon) -in:arena': null,
        [query]: {
          ...page(),
          totalCards: 1,
          cards: [
            {
              ...card('Birgi // Harnfel'),
              colors: undefined,
              image_uris: undefined,
              card_faces: [face('birgi', 'R'), face('harnfel', 'R')],
            },
          ],
        },
      });

      const created = await createDraft({
        name: 'Dragons',
        poolQuery: 't:dragon',
      }).expect(201);
      await snapshotted(created.body.id);

      const pool = await request(app.getHttpServer())
        .get(`/api/drafts/${created.body.id}/pool`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(pool.body[0]).toMatchObject({
        name: 'Birgi // Harnfel',
        colors: ['R'],
        images: [
          {
            small: 'https://cards.scryfall.io/small/birgi.jpg',
            normal: 'https://cards.scryfall.io/normal/birgi.jpg',
            large: 'https://cards.scryfall.io/large/birgi.jpg',
          },
          {
            small: 'https://cards.scryfall.io/small/harnfel.jpg',
            normal: 'https://cards.scryfall.io/normal/harnfel.jpg',
            large: 'https://cards.scryfall.io/large/harnfel.jpg',
          },
        ],
      });
      expect(pool.body[0].images[0]).not.toHaveProperty('png');
    });

    it('fails rather than completing when Scryfall runs out of pages early', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({
        'c:r': page('Shock'),
        '(c:r) -in:arena': null,
        [query]: { ...page('Shock'), totalCards: 200, hasMore: true },
        [`${query} page 2`]: null,
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

      expect((await snapshotted(created.body.id)).snapshot).toEqual({
        state: 'Failed',
        cards: 1,
        total: 200,
        error: 'Scryfall stopped returning cards before the pool was complete.',
      });
    });

    it('fails on a card with no oracle id rather than inventing a pick identity', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({
        'c:r': page('Shock'),
        '(c:r) -in:arena': null,
        [query]: {
          ...page(),
          totalCards: 1,
          cards: [card('Shock', { oracle_id: undefined })],
        },
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

      expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
        state: 'Failed',
        error: 'Shock has no oracle id.',
      });
    });

    it('keeps unexpected errors’ details out of the organizer’s view', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({
        'c:r': page('Shock'),
        '(c:r) -in:arena': null,
        [query]: new TypeError('connect ECONNREFUSED 10.0.0.7:5432'),
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

      expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
        state: 'Failed',
        error: 'Snapshotting the pool failed unexpectedly.',
      });
    });

    function retry(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/snapshot`)
        .set('Cookie', cookie);
    }

    it('surfaces a failure on the draft, and the organizer can retry it', async () => {
      const query = snapshotQuery('t:dragon c:r');
      scryfallAnswers({
        't:dragon c:r': page('Balefire Dragon'),
        '(t:dragon c:r) -in:arena': null,
        [query]: new ScryfallUnavailableError(503),
      });
      const created = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
      }).expect(201);
      expect((await snapshotted(created.body.id)).snapshot).toEqual({
        state: 'Failed',
        cards: 0,
        total: null,
        error: 'Scryfall could not be reached.',
      });

      scryfallAnswers({ [query]: page('Balefire Dragon', 'Shivan Dragon') });
      const retried = await retry(created.body.id).expect(202);

      expect(retried.body.snapshot).toEqual({
        state: 'Running',
        cards: 0,
        total: null,
      });
      expect((await snapshotted(created.body.id)).snapshot).toEqual({
        state: 'Complete',
        cards: 2,
        total: 2,
      });
    });

    it('starts a retried snapshot over, dropping the cards of the failed one', async () => {
      const query = snapshotQuery('t:dragon c:r');
      scryfallAnswers({
        't:dragon c:r': page('Balefire Dragon'),
        '(t:dragon c:r) -in:arena': null,
        [query]: { ...page('Balefire Dragon'), totalCards: 2, hasMore: true },
        [`${query} page 2`]: new ScryfallUnavailableError(503),
      });
      const created = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
      }).expect(201);
      expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
        state: 'Failed',
        cards: 1,
        total: 2,
      });

      scryfallAnswers({ [query]: page('Shivan Dragon') });
      await retry(created.body.id).expect(202);

      expect((await snapshotted(created.body.id)).snapshot).toEqual({
        state: 'Complete',
        cards: 1,
        total: 1,
      });
      const pool = await request(app.getHttpServer())
        .get(`/api/drafts/${created.body.id}/pool`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(pool.body.map((c: { name: string }) => c.name)).toEqual([
        'Shivan Dragon',
      ]);
    });

    it('explains a pool query Scryfall now rejects', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({
        'c:r': page('Shock'),
        '(c:r) -in:arena': null,
        [query]: new ScryfallRejectedSearchError('Too many terms.', []),
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

      expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
        state: 'Failed',
        error: 'Scryfall rejected the pool query: Too many terms.',
      });
    });

    it('keeps the pool frozen once the snapshot is complete', async () => {
      allOnArena('t:dragon c:r');
      const created = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
      }).expect(201);
      await snapshotted(created.body.id);

      const res = await retry(created.body.id).expect(409);

      expect(res.body).toEqual({
        error: 'pool-frozen',
        message: 'The pool is complete and can’t be changed.',
      });
      expect(scryfall.search).toHaveBeenCalledTimes(3);
    });

    it('lets an app admin retry, but not other role-holders', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({
        'c:r': page('Shock'),
        '(c:r) -in:arena': null,
        [query]: new ScryfallUnavailableError(503),
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
      await snapshotted(created.body.id);

      await retry(created.body.id, await signIn(bob)).expect(403);
      scryfallAnswers({ [query]: page('Shock') });
      await retry(created.body.id, await signIn(carol)).expect(202);

      expect((await snapshotted(created.body.id)).snapshot.state).toBe(
        'Complete',
      );
    });

    it('answers 404 for a draft that does not exist', async () => {
      await getDraft('no-such-draft').expect(404);
      await retry('no-such-draft').expect(404);
      await request(app.getHttpServer())
        .get('/api/drafts/no-such-draft/pool')
        .set('Cookie', aliceCookie)
        .expect(404);
    });

    it('resumes a snapshot a previous process left running', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({ [query]: page('Shock', 'Lightning Bolt') });
      const { id } = await app.get(PrismaService).draft.create({
        data: {
          name: 'Red',
          poolQuery: 'c:r',
          picksPerPlayer: 40,
          organizerId: alice.id,
          snapshotState: 'Running',
        },
      });
      await app.close();

      app = await startApp();

      expect((await snapshotted(id)).snapshot).toEqual({
        state: 'Complete',
        cards: 2,
        total: 2,
      });
    });

    it('stores each card’s identity, printing, type, colors, mana value and images', async () => {
      const query = snapshotQuery('t:dragon c:r');
      scryfallAnswers({
        't:dragon c:r': page('Balefire Dragon'),
        '(t:dragon c:r) -in:arena': null,
        [query]: {
          ...page(),
          totalCards: 1,
          cards: [
            card('Balefire Dragon', {
              id: '9f0a1c6e-id',
              oracle_id: '9f0a1c6e-oracle',
              set: 'ima',
              collector_number: '119',
              type_line: 'Creature — Dragon',
              colors: ['R'],
              cmc: 7,
            }),
          ],
        },
      });

      const created = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
      }).expect(201);
      await snapshotted(created.body.id);

      const pool = await request(app.getHttpServer())
        .get(`/api/drafts/${created.body.id}/pool`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(pool.body).toEqual([
        {
          scryfallId: '9f0a1c6e-id',
          oracleId: '9f0a1c6e-oracle',
          name: 'Balefire Dragon',
          set: 'ima',
          collectorNumber: '119',
          typeLine: 'Creature — Dragon',
          colors: ['R'],
          manaValue: 7,
          images: [
            {
              small: 'https://cards.scryfall.io/small/balefire-dragon.jpg',
              normal: 'https://cards.scryfall.io/normal/balefire-dragon.jpg',
              large: 'https://cards.scryfall.io/large/balefire-dragon.jpg',
            },
          ],
        },
      ]);
    });
  });

  it('refuses a pool query with cards not on Arena, and lists them', async () => {
    scryfallAnswers({
      'f:legacy t:dragon': page('Balefire Dragon', 'Ancient Hellkite'),
      '(f:legacy t:dragon) -in:arena': page(
        'Ancient Hellkite',
        'Dream Pillager',
      ),
    });

    const res = await createDraft({
      name: 'Dragons',
      poolQuery: 'f:legacy t:dragon',
    }).expect(422);

    expect(res.body).toEqual({
      error: 'not-on-arena',
      message: '2 cards in this pool query are not on Arena.',
      cards: ['Ancient Hellkite', 'Dream Pillager'],
      totalCards: 2,
    });
    await listDrafts().expect(200).expect([]);
  });

  it('reports how many cards are not on Arena when there are more than one page', async () => {
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': { ...page('Ancient Hellkite'), totalCards: 5000 },
    });

    const res = await createDraft({ name: 'Red', poolQuery: 'c:r' }).expect(
      422,
    );

    expect(res.body).toMatchObject({
      message: '5000 cards in this pool query are not on Arena.',
      cards: ['Ancient Hellkite'],
      totalCards: 5000,
    });
  });

  it('gives each player 40 picks unless told otherwise', async () => {
    allOnArena('cube:arena');

    const res = await createDraft({
      name: 'Arena cube',
      poolQuery: 'cube:arena',
    }).expect(201);

    expect(res.body.picksPerPlayer).toBe(40);
  });

  it('refuses a pool query that matches no cards', async () => {
    scryfallAnswers({ 'name:zzzzqqqq': null });

    const res = await createDraft({
      name: 'Nothing',
      poolQuery: 'name:zzzzqqqq',
    }).expect(422);

    expect(res.body).toEqual({
      error: 'no-cards',
      message: 'This pool query matches no cards.',
    });
    await listDrafts().expect(200).expect([]);
  });

  it('passes on Scryfall’s explanation when it rejects the pool query', async () => {
    scryfallAnswers({
      'c:r (((': new ScryfallRejectedSearchError(
        'Your search contains unclosed parentheses.',
        [],
      ),
    });

    const res = await createDraft({
      name: 'Oops',
      poolQuery: 'c:r (((',
    }).expect(422);

    expect(res.body).toEqual({
      error: 'query-rejected',
      message: 'Your search contains unclosed parentheses.',
      warnings: [],
    });
  });

  it('refuses a pool query when Scryfall ignored part of it', async () => {
    const warning =
      'Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.';
    scryfallAnswers({
      'c:r foo:bar': { ...page('Shock'), warnings: [warning] },
    });

    const res = await createDraft({
      name: 'Typo',
      poolQuery: 'c:r foo:bar',
    }).expect(422);

    expect(res.body).toEqual({
      error: 'query-rejected',
      message: 'Scryfall ignored part of this pool query.',
      warnings: [warning],
    });
    await listDrafts().expect(200).expect([]);
  });

  it('answers 502 when Scryfall cannot be reached', async () => {
    scryfallAnswers({ 'c:r': new ScryfallUnavailableError(503) });

    const res = await createDraft({ name: 'Red', poolQuery: 'c:r' }).expect(
      502,
    );

    expect(res.body).toMatchObject({ error: 'scryfall-unavailable' });
    await listDrafts().expect(200).expect([]);
  });

  it.each([
    ['no name', { poolQuery: 'c:r' }, 'Give the draft a name.'],
    [
      'a blank name',
      { name: '  ', poolQuery: 'c:r' },
      'Give the draft a name.',
    ],
    [
      'a name over 100 characters',
      { name: 'x'.repeat(101), poolQuery: 'c:r' },
      'Keep the name to 100 characters.',
    ],
    ['no pool query', { name: 'Red' }, 'Enter a pool query.'],
    [
      'a pool query over 900 characters',
      { name: 'Red', poolQuery: 'c:r '.repeat(226) },
      'Keep the pool query to 900 characters.',
    ],
    [
      'zero picks per player',
      { name: 'Red', poolQuery: 'c:r', picksPerPlayer: 0 },
      'Picks per player must be a whole number from 1 to 100.',
    ],
    [
      'fractional picks per player',
      { name: 'Red', poolQuery: 'c:r', picksPerPlayer: 2.5 },
      'Picks per player must be a whole number from 1 to 100.',
    ],
    [
      'picks per player left blank',
      { name: 'Red', poolQuery: 'c:r', picksPerPlayer: null },
      'Picks per player must be a whole number from 1 to 100.',
    ],
    [
      'picks per player as text',
      { name: 'Red', poolQuery: 'c:r', picksPerPlayer: '40' },
      'Picks per player must be a whole number from 1 to 100.',
    ],
  ])('rejects a draft with %s', async (_, body, message) => {
    const res = await createDraft(body).expect(400);

    expect(res.body).toEqual({ error: 'invalid', message });
    expect(scryfall.search).not.toHaveBeenCalled();
  });

  it('trims the name and pool query', async () => {
    allOnArena('t:dragon c:r');

    const res = await createDraft({
      name: '  Red dragons ',
      poolQuery: ' t:dragon c:r\n',
    }).expect(201);

    expect(res.body).toMatchObject({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    });
  });

  it('lists active and complete drafts, newest first', async () => {
    const prisma = app.get(PrismaService);
    const old = await prisma.draft.create({
      data: {
        name: 'Last month',
        poolQuery: 'cube:arena',
        picksPerPlayer: 45,
        state: 'Complete',
        organizerId: alice.id,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    });
    allOnArena('t:dragon c:r');
    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    }).expect(201);

    const res = await listDrafts().expect(200);

    expect(res.body).toEqual([
      expect.objectContaining({ id: created.body.id, state: 'Lobby' }),
      expect.objectContaining({
        id: old.id,
        state: 'Complete',
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    ]);
  });

  describe('lobby', () => {
    const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/5.png';
    const player = (user: { id: string; name: string }) => ({
      ...user,
      avatarUrl: defaultAvatar,
    });

    async function lobbyDraft() {
      allOnArena('c:r');
      const created = await createDraft({
        name: 'Red',
        poolQuery: 'c:r',
      }).expect(201);
      return created.body.id as string;
    }

    function join(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/players`)
        .set('Cookie', cookie);
    }

    function leave(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .delete(`/api/drafts/${id}/players/me`)
        .set('Cookie', cookie);
    }

    it('lists players in join order, with their avatars', async () => {
      const id = await lobbyDraft();
      const bobCookie = await signIn({ ...bob, avatar: 'a1b2c3' });

      const joined = await join(id, bobCookie).expect(201);
      const bobWithAvatar = {
        ...bob,
        avatarUrl: `https://cdn.discordapp.com/avatars/${bob.id}/a1b2c3.png`,
      };
      expect(joined.body.players).toEqual([bobWithAvatar]);
      await join(id).expect(201);

      const draft = await getDraft(id).expect(200);
      expect(draft.body.players).toEqual([bobWithAvatar, player(alice)]);
    });

    it('lets a player leave, and joining or leaving twice changes nothing', async () => {
      const id = await lobbyDraft();
      await join(id).expect(201);
      await join(id).expect(201);

      const left = await leave(id).expect(200);
      expect(left.body.players).toEqual([]);
      const again = await leave(id).expect(200);
      expect(again.body.players).toEqual([]);
    });

    it('refuses joining or leaving once the draft has started', async () => {
      const id = await lobbyDraft();
      await join(id).expect(201);
      const bobCookie = await signIn(bob);
      await app
        .get(PrismaService)
        .draft.update({ where: { id }, data: { state: 'Drafting' } });

      const refused = await join(id, bobCookie).expect(409);
      expect(refused.body).toEqual({
        error: 'draft-started',
        message: 'This draft has started.',
      });
      await leave(id).expect(409);
      const draft = await getDraft(id).expect(200);
      expect(draft.body.players).toEqual([player(alice)]);
    });

    it('is 404 for a draft that does not exist', async () => {
      await join('no-such-draft').expect(404);
      await leave('no-such-draft').expect(404);
    });
  });

  describe('seats and start', () => {
    /**
     * A draft whose three-card pool is snapshotted, joined by each of
     * `cookies` in order.
     */
    async function readyDraft(cookies: string[], picksPerPlayer = 1) {
      const cards = ['Shock', 'Lightning Bolt', 'Lava Spike'];
      scryfallAnswers({
        'c:r': page(...cards),
        '(c:r) -in:arena': null,
        [snapshotQuery('c:r')]: page(...cards),
      });
      const created = await createDraft({
        name: 'Red',
        poolQuery: 'c:r',
        picksPerPlayer,
      }).expect(201);
      const id = created.body.id as string;
      await snapshotted(id);
      for (const cookie of cookies) {
        await request(app.getHttpServer())
          .post(`/api/drafts/${id}/players`)
          .set('Cookie', cookie)
          .expect(201);
      }
      return id;
    }

    function start(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/start`)
        .set('Cookie', cookie);
    }

    const playerIds = (draft: { players: { id: string }[] }) =>
      draft.players.map((player) => player.id);

    it('starts the draft with the first seat to pick', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)]);

      const started = await start(id).expect(200);

      expect(started.body).toMatchObject({
        state: 'Drafting',
        turn: { pick: 1, round: 1, playerId: alice.id },
      });
      expect(playerIds(started.body)).toEqual([alice.id, bob.id]);
    });

    it('refuses a start when picks × players is more than the pool', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2);

      const refused = await start(id).expect(409);

      expect(refused.body).toEqual({
        error: 'pool-too-small',
        message: '2 players × 2 picks needs 4 cards, but the pool has 3.',
      });
      expect((await getDraft(id).expect(200)).body.state).toBe('Lobby');
    });

    it('refuses a start with fewer than 2 players', async () => {
      const id = await readyDraft([aliceCookie]);

      const refused = await start(id).expect(409);

      expect(refused.body).toEqual({
        error: 'player-count',
        message: 'A draft needs 2 to 12 players to start.',
      });
    });

    it('refuses a start before the pool snapshot is complete', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({
        'c:r': page('Shock'),
        '(c:r) -in:arena': null,
        [query]: new ScryfallUnavailableError(503),
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
      await snapshotted(created.body.id);

      const refused = await start(created.body.id).expect(409);

      expect(refused.body).toEqual({
        error: 'pool-not-ready',
        message: 'The pool snapshot isn’t complete yet.',
      });
    });

    it('refuses starting twice, and joining once started', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)]);
      await start(id).expect(200);

      const again = await start(id).expect(409);

      expect(again.body).toEqual({
        error: 'draft-started',
        message: 'This draft has started.',
      });
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/players`)
        .set('Cookie', await signIn(carol))
        .expect(409);
    });

    it('lets an app admin start the draft, but not other role-holders', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);

      await start(id, bobCookie).expect(403);
      await start(id, await signIn(carol)).expect(200);
    });

    it('is 404 for a draft that does not exist', async () => {
      await start('no-such-draft').expect(404);
    });

    function randomize(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/seats/randomize`)
        .set('Cookie', cookie);
    }

    it('lets the organizer randomize the seats', async () => {
      const id = await readyDraft([
        aliceCookie,
        await signIn(bob),
        await signIn(carol),
      ]);
      // Fisher–Yates with every draw 0: [a, b, c] → [c, b, a] → [b, c, a].
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      onTestFinished(() => random.mockRestore());

      const randomized = await randomize(id).expect(200);

      expect(playerIds(randomized.body)).toEqual([bob.id, carol.id, alice.id]);
      const draft = await getDraft(id).expect(200);
      expect(playerIds(draft.body)).toEqual([bob.id, carol.id, alice.id]);
    });

    it('lets only the organizer or an app admin randomize, and only in Lobby', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);

      await randomize(id, bobCookie).expect(403);
      await randomize(id, await signIn(carol)).expect(200);
      await start(id).expect(200);
      const refused = await randomize(id).expect(409);
      expect(refused.body.error).toBe('draft-started');
    });

    function reorder(id: string, players: unknown, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .put(`/api/drafts/${id}/seats`)
        .set('Cookie', cookie)
        .send({ players });
    }

    it('lets the organizer set the seat order, which the start keeps', async () => {
      const bobCookie = await signIn(bob);
      const carolCookie = await signIn(carol);
      const id = await readyDraft([aliceCookie, bobCookie, carolCookie]);

      const reordered = await reorder(id, [carol.id, alice.id, bob.id]).expect(
        200,
      );
      expect(playerIds(reordered.body)).toEqual([carol.id, alice.id, bob.id]);

      const started = await start(id).expect(200);
      expect(playerIds(started.body)).toEqual([carol.id, alice.id, bob.id]);
      expect(started.body.turn).toEqual({
        pick: 1,
        round: 1,
        playerId: carol.id,
      });
    });

    it('seats a player who joins after the order is set last', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)]);
      await reorder(id, [bob.id, alice.id]).expect(200);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/players`)
        .set('Cookie', await signIn(carol))
        .expect(201);

      const draft = await getDraft(id).expect(200);
      expect(playerIds(draft.body)).toEqual([bob.id, alice.id, carol.id]);
    });

    it('refuses a seat order that is not exactly the players', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)]);

      const missing = await reorder(id, [bob.id]).expect(409);
      expect(missing.body).toEqual({
        error: 'players-changed',
        message: 'The players have changed. Reload and try again.',
      });
      await reorder(id, [bob.id, alice.id, carol.id]).expect(409);
      await reorder(id, [bob.id, bob.id]).expect(400);
      await reorder(id, 'bob').expect(400);

      const draft = await getDraft(id).expect(200);
      expect(playerIds(draft.body)).toEqual([alice.id, bob.id]);
    });

    it('refuses changing seats once the draft has started', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)]);
      await start(id).expect(200);

      const refused = await reorder(id, [bob.id, alice.id]).expect(409);
      expect(refused.body.error).toBe('draft-started');
    });

    it('lets only the organizer or an app admin change seats', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);

      await reorder(id, [bob.id, alice.id], bobCookie).expect(403);
      await reorder(id, [bob.id, alice.id], await signIn(carol)).expect(200);
    });
  });

  it('is only for signed-in users', async () => {
    await request(app.getHttpServer()).get('/api/drafts').expect(401);
    await request(app.getHttpServer())
      .post('/api/drafts')
      .send({ name: 'Red', poolQuery: 'c:r' })
      .expect(401);
    expect(scryfall.search).not.toHaveBeenCalled();
  });
});
