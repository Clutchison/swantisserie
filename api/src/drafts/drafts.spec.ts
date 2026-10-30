import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { AdminConfig } from '../auth/admin-config.js';
import { SessionService } from '../auth/session.service.js';
import { DiscordConfig } from '../discord/discord-config.js';
import { DraftNotifierRetries } from '../discord/draft-notifier.js';
import { BotPickDelay } from './bot-players.js';
import { WebhookClient, WebhookGoneError } from '../discord/webhook-client.js';
import type { DraftView } from './draft-view.js';
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
/** Drafts' pages are at https://roto.example/drafts/:id. */
const discordConfig = new DiscordConfig({
  DISCORD_REDIRECT_URI: 'https://roto.example/api/auth/discord/callback',
});

describe('drafts', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  /** `session=<token>` for Alice, ready for a Cookie header. */
  let aliceCookie: string;
  const scryfall = {
    search: vi.fn<ScryfallClient['search']>(),
    printings: vi.fn<ScryfallClient['printings']>(),
  };
  const webhookClient = { post: vi.fn<WebhookClient['post']>() };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
  });

  afterAll(async () => {
    await database.stop();
  });

  /** `botDelayMs` is how long bots wait before picking: at once, unless told otherwise. */
  async function startApp(botDelayMs = 0) {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register({ webRoot: import.meta.dirname })],
    })
      .overrideProvider(ScryfallClient)
      .useValue(scryfall)
      .overrideProvider(AdminConfig)
      .useValue(admins)
      .overrideProvider(DiscordConfig)
      .useValue(discordConfig)
      .overrideProvider(WebhookClient)
      .useValue(webhookClient)
      // Retried at once, so tests needn't wait.
      .overrideProvider(DraftNotifierRetries)
      .useValue(new DraftNotifierRetries([0, 0]))
      .overrideProvider(BotPickDelay)
      .useValue(new BotPickDelay(botDelayMs))
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
      layout: 'normal',
      color_identity: ['R'],
      keywords: [],
      rarity: 'rare',
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
      webhook: null,
      version: 0,
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

    it('stores each face’s text, cost, colors and stats, so a search can match either face', async () => {
      const query = snapshotQuery('t:giant');
      scryfallAnswers({
        't:giant': page('Bonecrusher Giant // Stomp'),
        '(t:giant) -in:arena': null,
        [query]: {
          ...page(),
          totalCards: 1,
          cards: [
            card('Bonecrusher Giant // Stomp', {
              type_line: 'Creature — Giant // Instant — Adventure',
              mana_cost: '{2}{R} // {1}{R}',
              layout: 'adventure',
              cmc: 3,
              power: '4',
              toughness: '3',
              rarity: 'rare',
              card_faces: [
                {
                  name: 'Bonecrusher Giant',
                  mana_cost: '{2}{R}',
                  type_line: 'Creature — Giant',
                  oracle_text:
                    'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell’s controller.',
                  power: '4',
                  toughness: '3',
                },
                {
                  name: 'Stomp',
                  mana_cost: '{1}{R}',
                  type_line: 'Instant — Adventure',
                  oracle_text:
                    'Damage can’t be prevented this turn. Stomp deals 2 damage to any target.',
                },
              ],
            }),
          ],
        },
      });

      const created = await createDraft({
        name: 'Giants',
        poolQuery: 't:giant',
      }).expect(201);
      await snapshotted(created.body.id);

      const pool = await request(app.getHttpServer())
        .get(`/api/drafts/${created.body.id}/pool`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(pool.body[0]).toMatchObject({
        layout: 'adventure',
        manaCost: '{2}{R} // {1}{R}',
        oracleText: null,
        power: '4',
        toughness: '3',
        faces: [
          {
            name: 'Bonecrusher Giant',
            typeLine: 'Creature — Giant',
            oracleText:
              'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell’s controller.',
            manaCost: '{2}{R}',
            colors: null,
            power: '4',
            toughness: '3',
            loyalty: null,
            defense: null,
          },
          {
            name: 'Stomp',
            typeLine: 'Instant — Adventure',
            oracleText:
              'Damage can’t be prevented this turn. Stomp deals 2 damage to any target.',
            manaCost: '{1}{R}',
            colors: null,
            power: null,
            toughness: null,
            loyalty: null,
            defense: null,
          },
        ],
      });
    });

    it('stores a battle’s defense on its face', async () => {
      const query = snapshotQuery('t:battle');
      scryfallAnswers({
        't:battle': page('Invasion of Tarkir // Defiant Thundermaw'),
        '(t:battle) -in:arena': null,
        [query]: {
          ...page(),
          totalCards: 1,
          cards: [
            card('Invasion of Tarkir // Defiant Thundermaw', {
              layout: 'transform',
              type_line: 'Battle — Siege // Creature — Dragon',
              card_faces: [
                {
                  name: 'Invasion of Tarkir',
                  mana_cost: '{1}{R}',
                  type_line: 'Battle — Siege',
                  colors: ['R'],
                  defense: '5',
                },
                {
                  name: 'Defiant Thundermaw',
                  mana_cost: '',
                  type_line: 'Creature — Dragon',
                  colors: ['R'],
                  power: '4',
                  toughness: '4',
                },
              ],
            }),
          ],
        },
      });

      const created = await createDraft({
        name: 'Battles',
        poolQuery: 't:battle',
      }).expect(201);
      await snapshotted(created.body.id);

      const pool = await request(app.getHttpServer())
        .get(`/api/drafts/${created.body.id}/pool`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(pool.body[0]).toMatchObject({
        layout: 'transform',
        defense: null,
        faces: [
          { name: 'Invasion of Tarkir', defense: '5', power: null },
          { name: 'Defiant Thundermaw', defense: null, power: '4' },
        ],
      });
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

    describe('backfill', () => {
      /** A complete draft whose cards were snapshotted before the search fields were stored. */
      async function oldPool(names: string[]) {
        const { id } = await app.get(PrismaService).draft.create({
          data: {
            name: 'Red',
            poolQuery: 'c:r',
            picksPerPlayer: 40,
            organizerId: alice.id,
            snapshotState: 'Complete',
            poolTotal: names.length,
            pool: {
              create: names.map((name) => {
                const old = card(name);
                return {
                  scryfallId: old.id,
                  oracleId: old.oracle_id!,
                  name,
                  set: old.set,
                  collectorNumber: old.collector_number,
                  typeLine: old.type_line,
                  colors: old.colors,
                  manaValue: old.cmc,
                  images: [{ ...old.image_uris! }],
                };
              }),
            },
          },
        });
        return id;
      }

      async function poolOf(id: string) {
        const res = await request(app.getHttpServer())
          .get(`/api/drafts/${id}/pool`)
          .set('Cookie', aliceCookie)
          .expect(200);
        return res.body as Record<string, unknown>[];
      }

      it('fills in the search fields of a pool snapshotted before they were stored, by print id, leaving the rest alone', async () => {
        const id = await oldPool(['Shock']);
        const before = await poolOf(id);
        expect(before[0]).toMatchObject({ rarity: null, faces: null });
        scryfall.printings.mockResolvedValue([
          card('Shock', {
            // A newer copy of the card: the backfill must not take these.
            name: 'Shock (renamed)',
            cmc: 2,
            mana_cost: '{R}',
            oracle_text: 'Shock deals 2 damage to any target.',
            type_line: 'Instant',
            rarity: 'common',
          }),
        ]);
        await app.close();

        app = await startApp();

        await vi.waitFor(async () => {
          expect((await poolOf(id))[0]).toEqual({
            ...before[0],
            manaCost: '{R}',
            oracleText: 'Shock deals 2 damage to any target.',
            colorIdentity: ['R'],
            keywords: [],
            rarity: 'common',
            layout: 'normal',
            power: null,
            toughness: null,
            loyalty: null,
            defense: null,
            faces: [],
          });
        });
        expect(scryfall.printings).toHaveBeenCalledExactlyOnceWith([
          'shock-id',
        ]);
      });

      it('asks Scryfall for at most 75 cards at a time', async () => {
        const names = Array.from({ length: 80 }, (_, i) => `Card ${i}`);
        const id = await oldPool(names);
        scryfall.printings.mockImplementation(async (ids) =>
          names
            .map((name) => card(name))
            .filter((found) => ids.includes(found.id)),
        );
        await app.close();

        app = await startApp();

        await vi.waitFor(async () => {
          const pool = await poolOf(id);
          expect(pool.filter((c) => c.rarity === 'rare')).toHaveLength(80);
        });
        expect(
          scryfall.printings.mock.calls.map(([ids]) => ids.length),
        ).toEqual([75, 5]);
      });

      it('leaves a card Scryfall no longer has as it was', async () => {
        const id = await oldPool(['Shock', 'Lightning Bolt']);
        scryfall.printings.mockResolvedValue([card('Lightning Bolt')]);
        await app.close();

        app = await startApp();

        await vi.waitFor(async () => {
          const pool = await poolOf(id);
          expect(
            Object.fromEntries(pool.map((c) => [c.name, c.rarity])),
          ).toEqual({ Shock: null, 'Lightning Bolt': 'rare' });
        });
      });
    });

    it('stores each card’s identity, printing, images and the fields the pool search needs', async () => {
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
              mana_cost: '{5}{R}{R}',
              oracle_text:
                'Flying\nWhenever Balefire Dragon deals combat damage to a player, it deals that much damage to each creature that player controls.',
              color_identity: ['R'],
              keywords: ['Flying'],
              rarity: 'mythic',
              power: '6',
              toughness: '6',
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
          manaCost: '{5}{R}{R}',
          oracleText:
            'Flying\nWhenever Balefire Dragon deals combat damage to a player, it deals that much damage to each creature that player controls.',
          colorIdentity: ['R'],
          keywords: ['Flying'],
          rarity: 'mythic',
          layout: 'normal',
          power: '6',
          toughness: '6',
          loyalty: null,
          defense: null,
          faces: [],
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
    [
      'a webhook that is not an id',
      { name: 'Red', poolQuery: 'c:r', webhookId: 7 },
      'Choose a webhook from the list.',
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

  describe('webhook', () => {
    const webhookUrl =
      'https://discord.com/api/webhooks/1234567890/secret-token';
    let carolCookie: string;
    let webhookId: string;

    beforeEach(async () => {
      carolCookie = await signIn(carol);
      const res = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', carolCookie)
        .send({ name: '#roto-main', url: webhookUrl })
        .expect(201);
      webhookId = res.body.id;
      allOnArena('t:dragon c:r');
    });

    it('posts to the webhook the organizer chose, shown by name only', async () => {
      const created = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
        webhookId,
      }).expect(201);

      const webhook = { id: webhookId, name: '#roto-main' };
      expect(created.body.webhook).toEqual(webhook);
      const shown = await getDraft(created.body.id).expect(200);
      expect(shown.body.webhook).toEqual(webhook);
      const listed = await listDrafts().expect(200);
      expect(listed.body[0].webhook).toEqual(webhook);
      for (const res of [created, shown, listed]) {
        expect(res.text).not.toContain('secret-token');
      }
    });

    it('posts nowhere when the organizer chose no webhook', async () => {
      const created = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
        webhookId: null,
      }).expect(201);

      expect(created.body.webhook).toBeNull();
    });

    it('refuses a webhook that does not exist', async () => {
      const res = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
        webhookId: 'no-such-webhook',
      }).expect(400);

      expect(res.body).toEqual({
        error: 'invalid',
        message: 'That webhook has been removed. Choose another.',
      });
      expect(scryfall.search).not.toHaveBeenCalled();
      await listDrafts().expect(200).expect([]);
    });

    it('shows a webhook’s new name, and posts nowhere once it is removed', async () => {
      const { body } = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
        webhookId,
      }).expect(201);

      await request(app.getHttpServer())
        .patch(`/api/admin/webhooks/${webhookId}`)
        .set('Cookie', carolCookie)
        .send({ name: '#roto-league' })
        .expect(200);
      expect((await getDraft(body.id).expect(200)).body.webhook).toEqual({
        id: webhookId,
        name: '#roto-league',
      });

      await request(app.getHttpServer())
        .delete(`/api/admin/webhooks/${webhookId}`)
        .set('Cookie', carolCookie)
        .expect(204);
      expect((await getDraft(body.id).expect(200)).body.webhook).toBeNull();
    });
  });

  describe('lobby', () => {
    const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/5.png';
    const player = (user: { id: string; name: string }) => ({
      ...user,
      avatarUrl: defaultAvatar,
      isBot: false,
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
        isBot: false,
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

    describe('bots', () => {
      let carolCookie: string;

      beforeEach(async () => {
        carolCookie = await signIn(carol);
      });

      function addBot(id: string, cookie = carolCookie) {
        return request(app.getHttpServer())
          .post(`/api/drafts/${id}/bots`)
          .set('Cookie', cookie);
      }

      function removeBot(id: string, userId: string, cookie = carolCookie) {
        return request(app.getHttpServer())
          .delete(`/api/drafts/${id}/bots/${encodeURIComponent(userId)}`)
          .set('Cookie', cookie);
      }

      const bot = (name: string) => ({
        id: expect.stringMatching(/^bot:/),
        name,
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
        isBot: true,
      });

      it('lets an app admin add bots, named Bot 1, Bot 2 and so on', async () => {
        const id = await lobbyDraft();
        await join(id).expect(201);

        await addBot(id).expect(201);
        const added = await addBot(id).expect(201);

        expect(added.body.players).toEqual([
          player(alice),
          bot('Bot 1'),
          bot('Bot 2'),
        ]);
        expect(added.body.players[1].id).not.toBe(added.body.players[2].id);
      });

      it('numbers bots within each draft', async () => {
        const first = await lobbyDraft();
        const second = await lobbyDraft();
        await addBot(first).expect(201);

        const added = await addBot(second).expect(201);

        expect(added.body.players).toEqual([bot('Bot 1')]);
      });

      it('refuses bot changes from anyone but an app admin, the organizer too', async () => {
        const id = await lobbyDraft();
        const added = await addBot(id).expect(201);

        await addBot(id, aliceCookie).expect(403);
        await removeBot(id, added.body.players[0].id, aliceCookie).expect(403);
        const draft = await getDraft(id).expect(200);
        expect(draft.body.players).toEqual([bot('Bot 1')]);
      });

      it('refuses a bot once the draft has 12 players', async () => {
        const id = await lobbyDraft();
        for (let i = 0; i < 12; i++) await addBot(id).expect(201);

        const refused = await addBot(id).expect(409);

        expect(refused.body).toEqual({
          error: 'draft-full',
          message: 'A draft can have at most 12 players.',
        });
        expect((await getDraft(id).expect(200)).body.players).toHaveLength(12);
      });

      it('lets an app admin remove a bot, deleting it', async () => {
        const id = await lobbyDraft();
        await addBot(id).expect(201);
        const added = await addBot(id).expect(201);
        const botId = added.body.players[0].id;

        const removed = await removeBot(id, botId).expect(200);

        expect(removed.body.players).toEqual([bot('Bot 2')]);
        expect(
          await app
            .get(PrismaService)
            .user.findUnique({ where: { id: botId } }),
        ).toBeNull();
      });

      it('removes only bots', async () => {
        const id = await lobbyDraft();
        await join(id).expect(201);

        await removeBot(id, alice.id).expect(404);

        expect((await getDraft(id).expect(200)).body.players).toEqual([
          player(alice),
        ]);
      });

      it('refuses adding or removing bots once the draft has started', async () => {
        const id = await lobbyDraft();
        const added = await addBot(id).expect(201);
        await app
          .get(PrismaService)
          .draft.update({ where: { id }, data: { state: 'Drafting' } });

        await addBot(id).expect(409);
        const refused = await removeBot(id, added.body.players[0].id).expect(
          409,
        );
        expect(refused.body.error).toBe('draft-started');
        expect((await getDraft(id).expect(200)).body.players).toEqual([
          bot('Bot 1'),
        ]);
      });

      it('is 404 for a draft that does not exist', async () => {
        await addBot('no-such-draft').expect(404);
        await removeBot('no-such-draft', 'bot:x').expect(404);
      });
    });
  });

  /**
   * A draft whose pool of `cards` (three, unless told otherwise) is
   * snapshotted, joined by each of `cookies` in order.
   */
  async function readyDraft(
    cookies: string[],
    picksPerPlayer = 1,
    cards = ['Shock', 'Lightning Bolt', 'Lava Spike'],
    webhookId: string | null = null,
  ) {
    scryfallAnswers({
      'c:r': page(...cards),
      '(c:r) -in:arena': null,
      [snapshotQuery('c:r')]: page(...cards),
    });
    const created = await createDraft({
      name: 'Red',
      poolQuery: 'c:r',
      picksPerPlayer,
      webhookId,
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

  describe('seats and start', () => {
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

    it('refuses a start with more than 12 players', async () => {
      const cookies = [aliceCookie];
      for (let i = 1; i < 13; i++) {
        cookies.push(
          await signIn({ id: `8035111022467900${i}`, name: `Player ${i}` }),
        );
      }
      const id = await readyDraft(cookies);

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

    function reorder(id: string, userIds: unknown, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .put(`/api/drafts/${id}/seats`)
        .set('Cookie', cookie)
        .send({ userIds });
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

  describe('picks', () => {
    /**
     * A started draft of Alice then Bob, over Shock, Lightning Bolt, Lava
     * Spike and Skewer the Critics.
     */
    async function startedDraft(bobCookie: string, picksPerPlayer = 1) {
      const id = await readyDraft([aliceCookie, bobCookie], picksPerPlayer, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      await start(id).expect(200);
      return id;
    }

    function pick(id: string, oracleId: unknown, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie)
        .send({ oracleId });
    }

    function picks(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie);
    }

    it('lets the player whose turn it is pick a card, and the turn passes on', async () => {
      const id = await startedDraft(await signIn(bob));

      const picked = await pick(id, 'shock-oracle').expect(200);

      expect(picked.body.turn).toEqual({
        pick: 2,
        round: 1,
        playerId: bob.id,
      });
      expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
      expect((await picks(id).expect(200)).body).toEqual([
        {
          pick: 1,
          playerId: alice.id,
          oracleId: 'shock-oracle',
          name: 'Shock',
          layout: 'normal',
          set: 'ima',
          collectorNumber: '1',
        },
      ]);
    });

    it('follows snake order across rounds, logging every pick', async () => {
      const bobCookie = await signIn(bob);
      const id = await startedDraft(bobCookie, 2);

      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      const third = await pick(id, 'lava-spike-oracle', bobCookie).expect(200);

      expect(third.body.turn).toEqual({
        pick: 4,
        round: 2,
        playerId: alice.id,
      });
      expect((await picks(id).expect(200)).body).toEqual([
        {
          pick: 1,
          playerId: alice.id,
          oracleId: 'shock-oracle',
          name: 'Shock',
          layout: 'normal',
          set: 'ima',
          collectorNumber: '1',
        },
        {
          pick: 2,
          playerId: bob.id,
          oracleId: 'lightning-bolt-oracle',
          name: 'Lightning Bolt',
          layout: 'normal',
          set: 'ima',
          collectorNumber: '1',
        },
        {
          pick: 3,
          playerId: bob.id,
          oracleId: 'lava-spike-oracle',
          name: 'Lava Spike',
          layout: 'normal',
          set: 'ima',
          collectorNumber: '1',
        },
      ]);
    });

    it('refuses a pick out of turn, or by someone not in the draft', async () => {
      const bobCookie = await signIn(bob);
      const id = await startedDraft(bobCookie);

      const refused = await pick(id, 'shock-oracle', bobCookie).expect(409);
      expect(refused.body).toEqual({
        error: 'not-your-turn',
        message: 'It’s not your turn.',
      });
      await pick(id, 'shock-oracle', await signIn(carol)).expect(409);
      expect((await picks(id).expect(200)).body).toEqual([]);
    });

    it('refuses a card that has already been picked', async () => {
      const bobCookie = await signIn(bob);
      const id = await startedDraft(bobCookie);
      await pick(id, 'shock-oracle').expect(200);

      const refused = await pick(id, 'shock-oracle', bobCookie).expect(409);

      expect(refused.body).toEqual({
        error: 'already-picked',
        message: 'That card has already been picked.',
      });
      expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
    });

    it('refuses a card that is not in the pool', async () => {
      const id = await startedDraft(await signIn(bob));

      const refused = await pick(id, 'shivan-dragon-oracle').expect(404);

      expect(refused.body).toEqual({
        error: 'not-in-pool',
        message: 'That card isn’t in this pool.',
      });
      await pick(id, '').expect(400);
      await pick(id, 42).expect(400);
    });

    it('refuses picks before the draft starts', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)]);

      const refused = await pick(id, 'shock-oracle').expect(409);

      expect(refused.body).toEqual({
        error: 'not-drafting',
        message: 'This draft isn’t taking picks.',
      });
    });

    it('completes the draft with the last pick, and keeps it viewable', async () => {
      const bobCookie = await signIn(bob);
      const id = await startedDraft(bobCookie);
      await pick(id, 'shock-oracle').expect(200);

      const last = await pick(id, 'lightning-bolt-oracle', bobCookie).expect(
        200,
      );

      expect(last.body).toMatchObject({ state: 'Complete', turn: null });
      expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
      const listed = await request(app.getHttpServer())
        .get('/api/drafts')
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(
        listed.body.find((draft: { id: string }) => draft.id === id).state,
      ).toBe('Complete');
      expect(
        (await picks(id).expect(200)).body.map(
          (logged: { name: string }) => logged.name,
        ),
      ).toEqual(['Shock', 'Lightning Bolt']);
      const refused = await pick(id, 'lava-spike-oracle').expect(409);
      expect(refused.body.error).toBe('not-drafting');
    });

    it('makes concurrent picks one at a time, so only one of a player’s double pick lands', async () => {
      const id = await startedDraft(await signIn(bob));

      const responses = await Promise.all([
        pick(id, 'shock-oracle'),
        pick(id, 'lightning-bolt-oracle'),
      ]);

      expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const log = (await picks(id).expect(200)).body;
      expect(log).toHaveLength(1);
      expect(log[0].playerId).toBe(alice.id);
    });

    it('takes a pick sent twice at once only once', async () => {
      const id = await startedDraft(await signIn(bob));

      const responses = await Promise.all([
        pick(id, 'shock-oracle'),
        pick(id, 'shock-oracle'),
      ]);

      expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      expect((await picks(id).expect(200)).body).toHaveLength(1);
    });

    it('is 404 for a draft that does not exist', async () => {
      await pick('no-such-draft', 'shock-oracle').expect(404);
      await picks('no-such-draft').expect(404);
    });
  });

  describe('queue', () => {
    function queue(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .get(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie);
    }

    function enqueue(id: string, oracleId: unknown, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .send({ oracleId });
    }

    const shock = { oracleId: 'shock-oracle', name: 'Shock' };
    const bolt = { oracleId: 'lightning-bolt-oracle', name: 'Lightning Bolt' };
    const spike = { oracleId: 'lava-spike-oracle', name: 'Lava Spike' };

    it('lets a player add cards to the end of their queue', async () => {
      const id = await readyDraft([aliceCookie]);

      await enqueue(id, 'lava-spike-oracle').expect(200);
      const added = await enqueue(id, 'shock-oracle').expect(200);

      expect(added.body).toEqual({ cards: [spike, shock], lost: [] });
      expect((await queue(id).expect(200)).body).toEqual({
        cards: [spike, shock],
        lost: [],
      });
    });

    it('keeps each queue private to its player', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await enqueue(id, 'shock-oracle').expect(200);
      await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);

      expect((await queue(id).expect(200)).body.cards).toEqual([shock]);
      expect((await queue(id, bobCookie).expect(200)).body.cards).toEqual([
        spike,
      ]);
      const carolCookie = await signIn(carol);
      const refused = await queue(id, carolCookie).expect(403);
      expect(refused.body).toEqual({
        error: 'not-a-player',
        message: 'Only the draft’s players have queues.',
      });
      await enqueue(id, 'shock-oracle', carolCookie).expect(403);
      // Not in the draft as anyone sees it, either.
      const draft = JSON.stringify((await getDraft(id).expect(200)).body);
      expect(draft).not.toContain('shock-oracle');
    });

    it('adds a card already queued only once', async () => {
      const id = await readyDraft([aliceCookie]);
      await enqueue(id, 'shock-oracle').expect(200);
      await enqueue(id, 'lava-spike-oracle').expect(200);

      const again = await enqueue(id, 'shock-oracle').expect(200);

      expect(again.body.cards).toEqual([shock, spike]);
    });

    it('refuses a card not in the pool, or already picked', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);

      expect(
        (await enqueue(id, 'shock-oracle', bobCookie).expect(409)).body,
      ).toEqual({
        error: 'already-picked',
        message: 'That card has already been picked.',
      });
      expect(
        (await enqueue(id, 'shivan-dragon-oracle', bobCookie).expect(404)).body,
      ).toEqual({
        error: 'not-in-pool',
        message: 'That card isn’t in this pool.',
      });
      await enqueue(id, '', bobCookie).expect(400);
      await enqueue(id, 42, bobCookie).expect(400);
    });

    function reorder(id: string, oracleIds: unknown, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .put(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .send({ oracleIds });
    }

    it('lets a player reorder their queue', async () => {
      const id = await readyDraft([aliceCookie]);
      for (const card of [shock, bolt, spike]) {
        await enqueue(id, card.oracleId).expect(200);
      }

      const reordered = await reorder(id, [
        'lava-spike-oracle',
        'shock-oracle',
        'lightning-bolt-oracle',
      ]).expect(200);

      expect(reordered.body.cards).toEqual([spike, shock, bolt]);
      expect((await queue(id).expect(200)).body.cards).toEqual([
        spike,
        shock,
        bolt,
      ]);
    });

    it('refuses an order that is not exactly the queued cards', async () => {
      const id = await readyDraft([aliceCookie]);
      await enqueue(id, 'shock-oracle').expect(200);
      await enqueue(id, 'lava-spike-oracle').expect(200);

      const refused = await reorder(id, ['shock-oracle']).expect(409);

      expect(refused.body).toEqual({
        error: 'queue-changed',
        message: 'Your queue has changed. Reload and try again.',
      });
      await reorder(id, ['shock-oracle', 'lightning-bolt-oracle']).expect(409);
      await reorder(id, ['shock-oracle', 'shock-oracle']).expect(400);
      await reorder(id, 'shock-oracle').expect(400);
      expect((await queue(id).expect(200)).body.cards).toEqual([shock, spike]);
    });

    function remove(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .delete(`/api/drafts/${id}/queue/${oracleId}`)
        .set('Cookie', cookie);
    }

    it('lets a player remove a card from their queue', async () => {
      const id = await readyDraft([aliceCookie]);
      for (const card of [shock, bolt, spike]) {
        await enqueue(id, card.oracleId).expect(200);
      }

      const removed = await remove(id, 'lightning-bolt-oracle').expect(200);

      expect(removed.body.cards).toEqual([shock, spike]);
      // Removing it twice changes nothing.
      await remove(id, 'lightning-bolt-oracle').expect(200);
      expect((await queue(id).expect(200)).body.cards).toEqual([shock, spike]);
      await remove(id, 'shock-oracle', await signIn(carol)).expect(403);
    });

    describe('when cards are picked', () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      function pick(id: string, oracleId: string, cookie = aliceCookie) {
        return request(app.getHttpServer())
          .post(`/api/drafts/${id}/picks`)
          .set('Cookie', cookie)
          .send({ oracleId });
      }

      it('takes a card another player picks out of the queue, as lost', async () => {
        const bobCookie = await signIn(bob);
        const id = await readyDraft([aliceCookie, bobCookie], 1, [
          'Shock',
          'Lightning Bolt',
          'Lava Spike',
          'Skewer the Critics',
        ]);
        await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
        await enqueue(id, 'shock-oracle', bobCookie).expect(200);
        await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);
        await start(id).expect(200);

        // Bob's turn then picks Shock from his queue.
        await pick(id, 'lava-spike-oracle').expect(200);

        // Bob's own pick just leaves his queue; Alice's is lost to him.
        expect((await queue(id, bobCookie).expect(200)).body).toEqual({
          cards: [bolt],
          lost: [spike],
        });
      });

      it('lets a player dismiss their lost cards', async () => {
        const bobCookie = await signIn(bob);
        const id = await readyDraft([aliceCookie, bobCookie]);
        await enqueue(id, 'shock-oracle', bobCookie).expect(200);
        await start(id).expect(200);
        await pick(id, 'shock-oracle').expect(200);
        expect((await queue(id, bobCookie).expect(200)).body.lost).toEqual([
          shock,
        ]);

        const dismissed = await request(app.getHttpServer())
          .delete(`/api/drafts/${id}/queue/lost`)
          .set('Cookie', bobCookie)
          .expect(200);

        expect(dismissed.body).toEqual({ cards: [], lost: [] });
      });

      it('marks a card lost to a bot, too', async () => {
        const id = await readyDraft([aliceCookie], 1, ['Shock', 'Lava Spike']);
        await request(app.getHttpServer())
          .post(`/api/drafts/${id}/bots`)
          .set('Cookie', await signIn(carol))
          .expect(201);
        await enqueue(id, 'shock-oracle').expect(200);
        // The bot picks first: the last card by name, Shock.
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const draft = (await getDraft(id).expect(200)).body as DraftView;
        await request(app.getHttpServer())
          .put(`/api/drafts/${id}/seats`)
          .set('Cookie', aliceCookie)
          .send({ userIds: draft.players.map((p) => p.id).reverse() })
          .expect(200);
        await start(id).expect(200);

        await vi.waitFor(async () => {
          expect((await queue(id).expect(200)).body).toEqual({
            cards: [],
            lost: [shock],
          });
        });
      });

      it('refuses a card once the draft is complete', async () => {
        const bobCookie = await signIn(bob);
        const id = await readyDraft([aliceCookie, bobCookie]);
        await start(id).expect(200);
        await pick(id, 'shock-oracle').expect(200);
        await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

        const refused = await enqueue(id, 'lava-spike-oracle').expect(409);

        expect(refused.body).toEqual({
          error: 'draft-complete',
          message: 'This draft is complete.',
        });
      });
    });

    it('is 404 for a draft that does not exist', async () => {
      await queue('no-such-draft').expect(404);
      await enqueue('no-such-draft', 'shock-oracle').expect(404);
    });
  });

  describe('cascade', () => {
    const cards = [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ];
    let bobCookie: string;

    beforeEach(async () => {
      bobCookie = await signIn(bob);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function enqueue(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .send({ oracleId })
        .expect(200);
    }

    function pick(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie)
        .send({ oracleId });
    }

    /** The pick log as `Player: Card` lines. */
    async function pickLog(id: string) {
      const res = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .expect(200);
      const names = { [alice.id]: 'Alice', [bob.id]: 'Bob' };
      return (res.body as { playerId: string; name: string }[]).map(
        (pick) => `${names[pick.playerId] ?? 'Bot'}: ${pick.name}`,
      );
    }

    function queue(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .get(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .expect(200);
    }

    it('picks the next player’s queued cards for them after a pick, through the snake turn', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await enqueue(id, 'lava-spike-oracle', bobCookie);
      await enqueue(id, 'skewer-the-critics-oracle', bobCookie);
      await start(id).expect(200);

      const picked = await pick(id, 'shock-oracle').expect(200);

      // Bob picks last in round 1 and first in round 2.
      expect(picked.body.turn).toEqual({
        pick: 4,
        round: 2,
        playerId: alice.id,
      });
      expect(await pickLog(id)).toEqual([
        'Alice: Shock',
        'Bob: Lava Spike',
        'Bob: Skewer the Critics',
      ]);
      expect((await queue(id, bobCookie)).body).toEqual({
        cards: [],
        lost: [],
      });
    });

    it('skips queued cards already picked, and stops at a player with none left', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await enqueue(id, 'shock-oracle', bobCookie);
      await enqueue(id, 'lava-spike-oracle', bobCookie);
      await start(id).expect(200);

      const picked = await pick(id, 'shock-oracle').expect(200);

      expect(picked.body.turn).toEqual({ pick: 3, round: 2, playerId: bob.id });
      expect(await pickLog(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
      expect((await queue(id, bobCookie)).body).toEqual({
        cards: [],
        lost: [{ oracleId: 'shock-oracle', name: 'Shock' }],
      });
    });

    it('picks the first player’s queued card when the draft starts', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
      await enqueue(id, 'lightning-bolt-oracle');

      const started = await start(id).expect(200);

      expect(started.body.turn).toEqual({
        pick: 2,
        round: 1,
        playerId: bob.id,
      });
      expect(await pickLog(id)).toEqual(['Alice: Lightning Bolt']);
    });

    it('stops at a bot’s turn, and carries on after the bot picks', async () => {
      const id = await readyDraft([aliceCookie], 2, cards);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/bots`)
        .set('Cookie', await signIn(carol))
        .expect(201);
      // The bot picks the first available card by name.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await start(id).expect(200);
      await enqueue(id, 'skewer-the-critics-oracle');

      const picked = await pick(id, 'shock-oracle').expect(200);

      expect(picked.body.turn.pick).toBe(2);
      await vi.waitFor(async () => {
        expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
      });
      expect(await pickLog(id)).toEqual([
        'Alice: Shock',
        'Bot: Lava Spike',
        'Bot: Lightning Bolt',
        'Alice: Skewer the Critics',
      ]);
    });

    it('announces a pick and its cascade in one post, pinging who must pick next', async () => {
      const webhook = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({
          name: '#roto-main',
          url: 'https://discord.com/api/webhooks/1234567890/secret-token',
        })
        .expect(201);
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        2,
        cards,
        webhook.body.id,
      );
      await enqueue(id, 'lava-spike-oracle', bobCookie);
      await enqueue(id, 'skewer-the-critics-oracle', bobCookie);
      await start(id).expect(200);

      await pick(id, 'shock-oracle').expect(200);

      const messages = await vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(2);
        return webhookClient.post.mock.calls.map(([, message]) => message);
      });
      expect(messages[1]).toEqual({
        content:
          '**Alice** picked **Shock** (pick 1)\n' +
          '**Bob** picked **Lava Spike** (pick 2, queued)\n' +
          '**Bob** picked **Skewer the Critics** (pick 3, queued)\n' +
          `<@${alice.id}> you’re up\n` +
          `<https://roto.example/drafts/${id}>`,
        allowed_mentions: { parse: [], users: [alice.id] },
      });
    });
  });

  describe('undo', () => {
    const cards = [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ];
    let bobCookie: string;

    beforeEach(async () => {
      bobCookie = await signIn(bob);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function pick(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie)
        .send({ oracleId })
        .expect(200);
    }

    function undo(id: string, number: number | string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .delete(`/api/drafts/${id}/picks/${number}`)
        .set('Cookie', cookie);
    }

    function enqueue(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .send({ oracleId })
        .expect(200);
    }

    function queue(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .get(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .expect(200);
    }

    /** The pick log as `Player: Card` lines. */
    async function pickLog(id: string) {
      const res = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .expect(200);
      const names = { [alice.id]: 'Alice', [bob.id]: 'Bob' };
      return (res.body as { playerId: string; name: string }[]).map(
        (pick) => `${names[pick.playerId] ?? 'Bot'}: ${pick.name}`,
      );
    }

    it('removes the latest pick, returning its card to the pool and the turn to its player', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle');
      await pick(id, 'lightning-bolt-oracle', bobCookie);

      const undone = await undo(id, 2).expect(200);

      expect(undone.body.turn).toEqual({
        pick: 2,
        round: 1,
        playerId: bob.id,
      });
      expect(await pickLog(id)).toEqual(['Alice: Shock']);
      // Lightning Bolt is back in the pool.
      await pick(id, 'lightning-bolt-oracle', bobCookie);
      expect(await pickLog(id)).toEqual([
        'Alice: Shock',
        'Bob: Lightning Bolt',
      ]);
    });

    it('undoes only the last pick of a cascade, and makes no queued picks', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await enqueue(id, 'lava-spike-oracle', bobCookie);
      await enqueue(id, 'skewer-the-critics-oracle', bobCookie);
      await enqueue(id, 'lightning-bolt-oracle', bobCookie);
      await start(id).expect(200);
      await pick(id, 'shock-oracle');

      const undone = await undo(id, 3).expect(200);

      // Bob's queue still has Lightning Bolt, but it waits for him.
      expect(undone.body.turn).toEqual({ pick: 3, round: 2, playerId: bob.id });
      expect(await pickLog(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
    });

    it('returns the card to the queues it was lost from, to be picked on the next real pick', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await enqueue(id, 'skewer-the-critics-oracle');
      await pick(id, 'shock-oracle');
      await pick(id, 'skewer-the-critics-oracle', bobCookie);

      await undo(id, 2).expect(200);

      expect((await queue(id)).body).toEqual({
        cards: [
          { oracleId: 'skewer-the-critics-oracle', name: 'Skewer the Critics' },
        ],
        lost: [],
      });
      await pick(id, 'lightning-bolt-oracle', bobCookie);
      await pick(id, 'lava-spike-oracle', bobCookie);
      expect(await pickLog(id)).toEqual([
        'Alice: Shock',
        'Bob: Lightning Bolt',
        'Bob: Lava Spike',
        'Alice: Skewer the Critics',
      ]);
    });

    it('refuses to undo any pick but the latest, so an undo sent twice takes back one', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle');
      await pick(id, 'lightning-bolt-oracle', bobCookie);

      const [first, second] = await Promise.all([undo(id, 2), undo(id, 2)]);

      expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const refused = await undo(id, 2).expect(409);
      expect(refused.body.error).toBe('not-latest');
      expect(await pickLog(id)).toEqual(['Alice: Shock']);
    });

    it('refuses an undo with no picks to undo', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);

      const refused = await undo(id, 1).expect(409);

      expect(refused.body.error).toBe('not-latest');
    });

    it('refuses an undo before the draft starts, or once it is complete', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
      expect((await undo(id, 1).expect(409)).body.error).toBe('not-drafting');
      await start(id).expect(200);
      await pick(id, 'shock-oracle');
      await pick(id, 'lightning-bolt-oracle', bobCookie);

      const refused = await undo(id, 2).expect(409);

      expect(refused.body.error).toBe('not-drafting');
      expect(await pickLog(id)).toEqual([
        'Alice: Shock',
        'Bob: Lightning Bolt',
      ]);
    });

    it('undoes a pick while the draft is paused, leaving it paused', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle');
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/pause`)
        .set('Cookie', aliceCookie)
        .expect(200);

      const undone = await undo(id, 1).expect(200);

      expect(undone.body).toMatchObject({
        state: 'Paused',
        turn: { pick: 1, playerId: alice.id },
      });
      expect(await pickLog(id)).toEqual([]);
    });

    it('announces the undo, pinging the player whose turn it is again', async () => {
      const webhook = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({
          name: '#roto-main',
          url: 'https://discord.com/api/webhooks/1234567890/secret-token',
        })
        .expect(201);
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        2,
        cards,
        webhook.body.id,
      );
      await start(id).expect(200);
      await pick(id, 'shock-oracle');
      await pick(id, 'lightning-bolt-oracle', bobCookie);

      await undo(id, 2).expect(200);

      const messages = await vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(4);
        return webhookClient.post.mock.calls.map(([, message]) => message);
      });
      expect(messages[3]).toEqual({
        content:
          'Pick 2 (**Lightning Bolt** by **Bob**) was undone\n' +
          `<@${bob.id}> you’re up\n` +
          `<https://roto.example/drafts/${id}>`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it('lets an app admin undo, but not other players', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle');
      await pick(id, 'lightning-bolt-oracle', bobCookie);

      await undo(id, 2, bobCookie).expect(403);
      await undo(id, 2, await signIn(carol)).expect(200);
    });

    it('is a 400 for a pick that is not a number, and 404 for a draft that does not exist', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);

      await undo(id, 'latest').expect(400);
      await undo('no-such-draft', 1).expect(404);
    });
  });

  describe('pause and resume', () => {
    const cards = [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ];
    let bobCookie: string;

    beforeEach(async () => {
      bobCookie = await signIn(bob);
    });

    function pick(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie)
        .send({ oracleId });
    }

    function pause(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/pause`)
        .set('Cookie', cookie);
    }

    function resume(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/resume`)
        .set('Cookie', cookie);
    }

    function enqueue(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .send({ oracleId })
        .expect(200);
    }

    /** The pick log as `Player: Card` lines. */
    async function pickLog(id: string) {
      const res = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .expect(200);
      const names = { [alice.id]: 'Alice', [bob.id]: 'Bob' };
      return (res.body as { playerId: string; name: string }[]).map(
        (pick) => `${names[pick.playerId] ?? 'Bot'}: ${pick.name}`,
      );
    }

    it('pauses the draft, refusing picks until it resumes', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);

      const paused = await pause(id).expect(200);

      expect(paused.body).toMatchObject({
        state: 'Paused',
        turn: { pick: 1, playerId: alice.id },
      });
      const refused = await pick(id, 'shock-oracle').expect(409);
      expect(refused.body.error).toBe('not-drafting');
      expect(await pickLog(id)).toEqual([]);

      const resumed = await resume(id).expect(200);

      expect(resumed.body).toMatchObject({
        state: 'Drafting',
        turn: { pick: 1, playerId: alice.id },
      });
      await pick(id, 'shock-oracle').expect(200);
      expect(await pickLog(id)).toEqual(['Alice: Shock']);
    });

    it('makes the queued picks due on resume, cascading from whoever is up', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pause(id).expect(200);
      // Queued while paused: nothing is picked yet.
      await enqueue(id, 'shock-oracle');
      await enqueue(id, 'lightning-bolt-oracle', bobCookie);
      await enqueue(id, 'lava-spike-oracle', bobCookie);
      expect(await pickLog(id)).toEqual([]);

      const resumed = await resume(id).expect(200);

      expect(resumed.body.turn).toEqual({
        pick: 4,
        round: 2,
        playerId: alice.id,
      });
      expect(await pickLog(id)).toEqual([
        'Alice: Shock',
        'Bob: Lightning Bolt',
        'Bob: Lava Spike',
      ]);
    });

    it('refuses to pause a draft that is not drafting, or resume one that is not paused', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
      expect((await pause(id).expect(409)).body.error).toBe('not-drafting');
      expect((await resume(id).expect(409)).body.error).toBe('not-paused');
      await start(id).expect(200);
      expect((await resume(id).expect(409)).body.error).toBe('not-paused');
      await pause(id).expect(200);
      expect((await pause(id).expect(409)).body.error).toBe('not-drafting');
      await resume(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

      const refused = await pause(id).expect(409);

      expect(refused.body.error).toBe('not-drafting');
    });

    it('lets an app admin pause and resume, but not other players', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      const carolCookie = await signIn(carol);

      await pause(id, bobCookie).expect(403);
      await pause(id, carolCookie).expect(200);
      await resume(id, bobCookie).expect(403);
      await resume(id, carolCookie).expect(200);
      await pause('no-such-draft').expect(404);
    });

    it('announces a pause, and pings whoever is up on resume', async () => {
      const webhook = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({
          name: '#roto-main',
          url: 'https://discord.com/api/webhooks/1234567890/secret-token',
        })
        .expect(201);
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        2,
        cards,
        webhook.body.id,
      );
      await start(id).expect(200);
      await pause(id).expect(200);
      await enqueue(id, 'shock-oracle');

      await resume(id).expect(200);

      const messages = await vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(3);
        return webhookClient.post.mock.calls.map(([, message]) => message);
      });
      const link = `<https://roto.example/drafts/${id}>`;
      expect(messages.slice(1)).toEqual([
        {
          content: `**Red** is paused\n${link}`,
          allowed_mentions: { parse: [], users: [] },
        },
        {
          content:
            '**Red** has resumed\n' +
            '**Alice** picked **Shock** (pick 1, queued)\n' +
            `<@${bob.id}> you’re up\n${link}`,
          allowed_mentions: { parse: [], users: [bob.id] },
        },
      ]);
    });
  });

  describe('close and reopen', () => {
    const cards = [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ];
    let bobCookie: string;

    beforeEach(async () => {
      bobCookie = await signIn(bob);
    });

    function post(id: string, action: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/${action}`)
        .set('Cookie', cookie);
    }

    function close(id: string, cookie = aliceCookie) {
      return post(id, 'close', cookie);
    }

    function reopen(id: string, cookie = aliceCookie) {
      return post(id, 'reopen', cookie);
    }

    function pick(id: string, oracleId: string, cookie = aliceCookie) {
      return post(id, 'picks', cookie).send({ oracleId });
    }

    function enqueue(id: string, oracleId: string, cookie = aliceCookie) {
      return post(id, 'queue', cookie).send({ oracleId });
    }

    function queue(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .get(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie);
    }

    function pickLog(id: string) {
      return request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .expect(200);
    }

    it('closes a drafting draft with no picks, showing no turn', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);

      const closed = await close(id).expect(200);

      expect(closed.body).toMatchObject({ state: 'Closed', turn: null });
    });

    it('closes a paused draft', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await post(id, 'pause').expect(200);

      expect((await close(id).expect(200)).body.state).toBe('Closed');
    });

    it('keeps every pick as made, even mid-round', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);

      await close(id).expect(200);

      expect(
        (await pickLog(id)).body.map((p: { name: string }) => p.name),
      ).toEqual(['Shock']);
    });

    it('refuses to close a draft in the lobby, complete or already closed', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
      expect((await close(id).expect(409)).body.error).toBe('not-closable');

      await start(id).expect(200);
      await close(id).expect(200);
      expect((await close(id).expect(409)).body.error).toBe('not-closable');

      await reopen(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      expect((await close(id).expect(409)).body.error).toBe('not-closable');
    });

    it('refuses to reopen a draft that is not closed, so never a complete one', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
      expect((await reopen(id).expect(409)).body.error).toBe('not-closed');

      await start(id).expect(200);
      expect((await reopen(id).expect(409)).body.error).toBe('not-closed');

      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      expect((await reopen(id).expect(409)).body.error).toBe('not-closed');
    });

    it('lets an app admin close and reopen, but not other players', async () => {
      const carolCookie = await signIn(carol);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);

      await close(id, bobCookie).expect(403);
      await close(id, carolCookie).expect(200);
      await reopen(id, bobCookie).expect(403);
      await reopen(id, carolCookie).expect(200);
    });

    it('refuses picks and undo while closed, leaving the pool and pick log readable', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await close(id).expect(200);

      expect(
        (await pick(id, 'lightning-bolt-oracle', bobCookie).expect(409)).body
          .error,
      ).toBe('not-drafting');
      await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/picks/1`)
        .set('Cookie', aliceCookie)
        .expect(409);
      expect((await post(id, 'pause').expect(409)).body.error).toBe(
        'not-drafting',
      );
      expect((await post(id, 'resume').expect(409)).body.error).toBe(
        'not-paused',
      );

      expect((await pickLog(id)).body).toHaveLength(1);
      const pool = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/pool`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(pool.body).toHaveLength(cards.length);
    });

    it('refuses every queue edit while closed, and keeps the queue saved', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
      const saved = (await queue(id, bobCookie).expect(200)).body;
      await close(id).expect(200);

      const refused = await enqueue(id, 'shock-oracle', bobCookie).expect(409);
      expect(refused.body).toEqual({
        error: 'draft-closed',
        message: 'This draft is closed.',
      });
      await request(app.getHttpServer())
        .put(`/api/drafts/${id}/queue`)
        .set('Cookie', bobCookie)
        .send({ oracleIds: ['lava-spike-oracle'] })
        .expect(409);
      await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/queue/lava-spike-oracle`)
        .set('Cookie', bobCookie)
        .expect(409);
      await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/queue/lost`)
        .set('Cookie', bobCookie)
        .expect(409);

      expect((await queue(id, bobCookie).expect(200)).body).toEqual(saved);
    });

    it('returns to Drafting even if it was paused, and cascades queued picks', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await post(id, 'pause').expect(200);
      await enqueue(id, 'shock-oracle').expect(200);
      await close(id).expect(200);

      const reopened = await reopen(id).expect(200);

      expect(reopened.body).toMatchObject({
        state: 'Drafting',
        turn: { pick: 2, round: 1, playerId: bob.id },
      });
      expect(
        (await pickLog(id)).body.map((p: { name: string }) => p.name),
      ).toEqual(['Shock']);
    });

    it('announces a close pinging nobody, and a reopen pinging whoever is up', async () => {
      const webhook = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({
          name: '#roto-main',
          url: 'https://discord.com/api/webhooks/1234567890/secret-token',
        })
        .expect(201);
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        2,
        cards,
        webhook.body.id,
      );
      await start(id).expect(200);
      await enqueue(id, 'shock-oracle').expect(200);
      await close(id).expect(200);
      await reopen(id).expect(200);

      const messages = await vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(3);
        return webhookClient.post.mock.calls.map(([, message]) => message);
      });
      const link = `<https://roto.example/drafts/${id}>`;
      expect(messages.slice(1)).toEqual([
        {
          content: `**Red** has been closed\n${link}`,
          allowed_mentions: { parse: [], users: [] },
        },
        {
          content:
            '**Red** has reopened\n' +
            '**Alice** picked **Shock** (pick 1, queued)\n' +
            `<@${bob.id}> you’re up\n${link}`,
          allowed_mentions: { parse: [], users: [bob.id] },
        },
      ]);
    });
  });

  describe('announcements', () => {
    const webhookUrl =
      'https://discord.com/api/webhooks/1234567890/secret-token';
    let bobCookie: string;
    let webhookId: string;

    beforeEach(async () => {
      bobCookie = await signIn(bob);
      const res = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({ name: '#roto-main', url: webhookUrl })
        .expect(201);
      webhookId = res.body.id;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Each post's content, once `count` have been made. */
    async function posted(count: number) {
      return vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(count);
        return webhookClient.post.mock.calls.map(
          ([, message]) => message.content,
        );
      });
    }

    it('announces the start to the draft’s webhook, with the seat order', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );

      await start(id).expect(200);

      expect(await posted(1)).toEqual([
        '**Red** has started. Seat order:\n' +
          '1. **Alice**\n' +
          '2. **Bob**\n' +
          `<@${alice.id}> you’re up\n` +
          `<https://roto.example/drafts/${id}>`,
      ]);
      expect(webhookClient.post).toHaveBeenCalledWith(webhookUrl, {
        content: expect.any(String),
        allowed_mentions: { parse: [], users: [alice.id] },
      });
    });
    it('announces each pick, pinging the next player, then the draft’s end', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      await start(id).expect(200);
      const link = `<https://roto.example/drafts/${id}>`;

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', bobCookie)
        .send({ oracleId: 'lava-spike-oracle' })
        .expect(200);

      expect((await posted(4)).slice(1)).toEqual([
        `**Alice** picked **Shock** (pick 1)\n<@${bob.id}> you’re up\n${link}`,
        `**Bob** picked **Lava Spike** (pick 2)\n${link}`,
        `**Red** is complete. See everyone’s picks:\n${link}`,
      ]);
      expect(webhookClient.post.mock.calls[1][1].allowed_mentions).toEqual({
        parse: [],
        users: [bob.id],
      });
    });
    it('posts nothing for a draft without a webhook', async () => {
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);

      // Give a stray post the chance to happen.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(webhookClient.post).not.toHaveBeenCalled();
    });

    it('retries a failed post, and keeps the pick when every try fails', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      await start(id).expect(200);
      await posted(1);
      webhookClient.post.mockRejectedValue(new Error('Discord is down'));
      const logged = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);

      // The first try and two retries.
      await posted(4);
      await vi.waitFor(() =>
        expect(logged).toHaveBeenCalledWith(
          expect.stringContaining('Discord is down'),
        ),
      );
      expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-token');
      expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
    });

    it('gets a post through on a retry', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      webhookClient.post.mockRejectedValueOnce(new Error('Discord is down'));

      await start(id).expect(200);

      const [first, retried] = await posted(2);
      expect(retried).toBe(first);
      expect(first).toContain('has started');
    });

    it('doesn’t retry a webhook Discord no longer has', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      webhookClient.post.mockRejectedValue(new WebhookGoneError());
      const logged = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await start(id).expect(200);

      await vi.waitFor(() => expect(logged).toHaveBeenCalled());
      expect(webhookClient.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('bot players', () => {
    const cards = [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
      'Play with Fire',
      'Burst Lightning',
      'Firebolt',
      'Fireblast',
    ];

    /**
     * A draft of Alice then `bots` bots, each making `picksPerPlayer` picks
     * from `cards`, ready to start.
     */
    async function draftWithBots(
      bots: number,
      picksPerPlayer = 1,
      webhookId: string | null = null,
    ) {
      const id = await readyDraft(
        [aliceCookie],
        picksPerPlayer,
        cards,
        webhookId,
      );
      const carolCookie = await signIn(carol);
      let draft!: DraftView;
      for (let i = 0; i < bots; i++) {
        const res = await request(app.getHttpServer())
          .post(`/api/drafts/${id}/bots`)
          .set('Cookie', carolCookie)
          .expect(201);
        draft = res.body;
      }
      return { id, botIds: draft.players.slice(1).map((player) => player.id) };
    }

    function pick(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie)
        .send({ oracleId });
    }

    async function pickLog(id: string) {
      const res = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .expect(200);
      return res.body as { pick: number; playerId: string; name: string }[];
    }

    /** The draft once its turn is pick `number`. */
    function atPick(id: string, number: number) {
      return vi.waitFor(async () => {
        const draft = (await getDraft(id).expect(200)).body as DraftView;
        expect(draft.turn?.pick).toBe(number);
        return draft;
      });
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Lets any bot timers that are due fire, and their picks land. */
    const settle = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    it('has bots pick available cards on their turns until it is yours, through to the end', async () => {
      const { id, botIds } = await draftWithBots(3, 2);
      await start(id).expect(200);

      await pick(id, 'shock-oracle').expect(200);

      // Snake order: Alice, bots 1-3, then bots 3-1 and Alice again.
      const draft = await atPick(id, 8);
      expect(draft.turn).toEqual({ pick: 8, round: 2, playerId: alice.id });
      const log = await pickLog(id);
      expect(log.map((logged) => logged.playerId)).toEqual([
        alice.id,
        botIds[0],
        botIds[1],
        botIds[2],
        botIds[2],
        botIds[1],
        botIds[0],
      ]);
      const picked = log.map((logged) => logged.name);
      expect(new Set(picked).size).toBe(7);
      const [last] = cards.filter((name) => !picked.includes(name));
      const oracleId = `${last.toLowerCase().replace(/\W+/g, '-')}-oracle`;
      const final = await pick(id, oracleId).expect(200);
      expect(final.body.state).toBe('Complete');
    });

    it('has a bot in the first seat pick once the draft starts', async () => {
      const { id, botIds } = await draftWithBots(1);
      await request(app.getHttpServer())
        .put(`/api/drafts/${id}/seats`)
        .set('Cookie', aliceCookie)
        .send({ userIds: [botIds[0], alice.id] })
        .expect(200);

      await start(id).expect(200);

      expect((await atPick(id, 2)).turn?.playerId).toBe(alice.id);
      expect((await pickLog(id)).map((logged) => logged.playerId)).toEqual([
        botIds[0],
      ]);
    });

    it('picks uniformly at random from the cards not yet picked', async () => {
      const { id } = await draftWithBots(1);
      await start(id).expect(200);
      // Of the seven cards left, by name, the last but one.
      vi.spyOn(Math, 'random').mockReturnValue(5.5 / 7);

      await pick(id, 'fireblast-oracle').expect(200);

      await vi.waitFor(async () => {
        expect((await pickLog(id)).map((logged) => logged.name)).toEqual([
          'Fireblast',
          'Shock',
        ]);
      });
    });

    it('does nothing when its timer fires after the turn has moved on', async () => {
      await app.close();
      app = await startApp(100);
      aliceCookie = await signIn(alice);
      const { id, botIds } = await draftWithBots(1, 2);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);

      // Pick 2 is made some other way before the bot's timer fires.
      const prisma = app.get(PrismaService);
      const player = await prisma.player.findFirstOrThrow({
        where: { draftId: id, userId: botIds[0] },
      });
      const card = await prisma.poolCard.findFirstOrThrow({
        where: { draftId: id, name: 'Firebolt' },
      });
      await prisma.pick.create({
        data: {
          draftId: id,
          number: 2,
          playerId: player.id,
          poolCardId: card.id,
        },
      });
      await settle(300);

      expect((await pickLog(id)).map((logged) => logged.name)).toEqual([
        'Shock',
        'Firebolt',
      ]);
    });

    it('does nothing when its timer fires while the draft is paused, and picks once it resumes', async () => {
      await app.close();
      app = await startApp(100);
      aliceCookie = await signIn(alice);
      const { id, botIds } = await draftWithBots(1);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/pause`)
        .set('Cookie', aliceCookie)
        .expect(200);
      await settle(300);

      expect(await pickLog(id)).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/resume`)
        .set('Cookie', aliceCookie)
        .expect(200);

      await vi.waitFor(async () => {
        expect((await pickLog(id)).map((logged) => logged.playerId)).toEqual([
          alice.id,
          botIds[0],
        ]);
      });
    });

    it('does nothing when its timer fires while the draft is closed, and picks once it reopens', async () => {
      await app.close();
      app = await startApp(100);
      aliceCookie = await signIn(alice);
      const { id, botIds } = await draftWithBots(1);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/close`)
        .set('Cookie', aliceCookie)
        .expect(200);
      await settle(300);

      expect(await pickLog(id)).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/reopen`)
        .set('Cookie', aliceCookie)
        .expect(200);

      await vi.waitFor(async () => {
        expect((await pickLog(id)).map((logged) => logged.playerId)).toEqual([
          alice.id,
          botIds[0],
        ]);
      });
    });

    it('picks again when an undo gives it its turn back', async () => {
      const { id, botIds } = await draftWithBots(1, 2);
      await start(id).expect(200);
      // The bot picks the first available card by name.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await pick(id, 'shock-oracle').expect(200);
      await atPick(id, 4);

      await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/picks/3`)
        .set('Cookie', aliceCookie)
        .expect(200);

      await atPick(id, 4);
      expect(await pickLog(id)).toEqual([
        expect.objectContaining({ playerId: alice.id, name: 'Shock' }),
        expect.objectContaining({
          playerId: botIds[0],
          name: 'Burst Lightning',
        }),
        expect.objectContaining({ playerId: botIds[0], name: 'Fireblast' }),
      ]);
    });

    it('picks after a restart that left it its turn', async () => {
      await app.close();
      // Too slow to pick before the restart.
      app = await startApp(60_000);
      aliceCookie = await signIn(alice);
      const { id, botIds } = await draftWithBots(1);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await app.close();

      app = await startApp();

      await vi.waitFor(async () => {
        expect((await pickLog(id)).map((logged) => logged.playerId)).toEqual([
          alice.id,
          botIds[0],
        ]);
      });
    });

    describe('announcements', () => {
      const webhookUrl =
        'https://discord.com/api/webhooks/1234567890/secret-token';

      it('names a bot whose turn it is without pinging it, and pings you after it picks', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/admin/webhooks')
          .set('Cookie', await signIn(carol))
          .send({ name: '#roto-test', url: webhookUrl })
          .expect(201);
        const { id } = await draftWithBots(1, 2, res.body.id);
        await start(id).expect(200);
        const link = `<https://roto.example/drafts/${id}>`;

        await pick(id, 'shock-oracle').expect(200);

        const messages = await vi.waitFor(() => {
          expect(webhookClient.post).toHaveBeenCalledTimes(4);
          return webhookClient.post.mock.calls.map(([, message]) => message);
        });
        expect(messages[1]).toEqual({
          content: `**Alice** picked **Shock** (pick 1)\n**Bot 1** is up\n${link}`,
          allowed_mentions: { parse: [], users: [] },
        });
        expect(messages[2].content).toMatch(
          /^\*\*Bot 1\*\* picked .* \(pick 2\)\n\*\*Bot 1\*\* is up\n/,
        );
        expect(messages[2].allowed_mentions.users).toEqual([]);
        expect(messages[3].content).toMatch(
          new RegExp(`\\(pick 3\\)\\n<@${alice.id}> you’re up\\n`),
        );
        expect(messages[3].allowed_mentions.users).toEqual([alice.id]);
      });
    });
  });

  describe('cancel', () => {
    function cancel(id: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .delete(`/api/drafts/${id}`)
        .set('Cookie', cookie);
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('cancels a lobby draft, so its link is not found and the list omits it', async () => {
      const id = await readyDraft([aliceCookie]);

      await cancel(id).expect(204);

      await getDraft(id).expect(404);
      expect((await listDrafts().expect(200)).body).toEqual([]);
    });

    it('leaves nothing belonging to the draft, including its bots', async () => {
      const id = await readyDraft([aliceCookie]);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/queue`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/bots`)
        .set('Cookie', await signIn(carol))
        .expect(201);

      await cancel(id).expect(204);

      const prisma = app.get(PrismaService);
      expect(await prisma.poolCard.count()).toBe(0);
      expect(await prisma.player.count()).toBe(0);
      expect(await prisma.queuedCard.count()).toBe(0);
      expect(await prisma.user.count({ where: { isBot: true } })).toBe(0);
      expect(await prisma.user.count({ where: { id: alice.id } })).toBe(1);
    });

    it('lets an app admin cancel, but not other role-holders', async () => {
      const id = await readyDraft([aliceCookie]);

      await cancel(id, await signIn(bob)).expect(403);
      await getDraft(id).expect(200);

      await cancel(id, await signIn(carol)).expect(204);
    });

    it('answers 404 for a draft that does not exist', async () => {
      await cancel('no-such-draft').expect(404);
    });

    it('refuses to cancel a draft that has left the lobby', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)]);
      await start(id).expect(200);

      const refused = await cancel(id).expect(409);

      expect(refused.body).toEqual({
        error: 'draft-started',
        message: 'This draft has started.',
      });
      await getDraft(id).expect(200);
    });

    it('cancels a draft whose snapshot failed', async () => {
      const query = snapshotQuery('c:r');
      scryfallAnswers({
        'c:r': page('Shock'),
        '(c:r) -in:arena': null,
        [query]: new ScryfallUnavailableError(503),
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
      await snapshotted(created.body.id);

      await cancel(created.body.id).expect(204);

      await getDraft(created.body.id).expect(404);
    });

    /**
     * A draft whose snapshot is waiting on Scryfall for page 2, having saved
     * page 1. `answer` settles that wait.
     */
    async function draftWithRunningSnapshot() {
      const query = snapshotQuery('c:r');
      let answer!: {
        resolve: (page: ScryfallSearchPage) => void;
        reject: (err: Error) => void;
      };
      const pageTwo = new Promise<ScryfallSearchPage>((resolve, reject) => {
        answer = { resolve, reject };
      });
      scryfall.search.mockImplementation(async (searched, number = 1) => {
        if (searched !== query) {
          return searched === 'c:r' ? page('Shock') : null;
        }
        if (number === 1) {
          return { ...page('Shock'), totalCards: 2, hasMore: true };
        }
        return pageTwo;
      });
      const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
      await vi.waitFor(() =>
        expect(scryfall.search).toHaveBeenCalledWith(query, 2),
      );
      return { id: created.body.id as string, answer };
    }

    it('stops a running snapshot cleanly when its next page arrives', async () => {
      const { id, answer } = await draftWithRunningSnapshot();
      const errors = vi.spyOn(Logger.prototype, 'error');

      await cancel(id).expect(204);
      answer.resolve(page('Lightning Bolt'));
      // Shutting down waits for the snapshot to end.
      await app.close();

      expect(errors).not.toHaveBeenCalled();
      app = await startApp();
      await getDraft(id).expect(404);
      expect(await app.get(PrismaService).poolCard.count()).toBe(0);
    });

    it('stops a running snapshot cleanly when Scryfall then fails', async () => {
      const { id, answer } = await draftWithRunningSnapshot();
      const errors = vi.spyOn(Logger.prototype, 'error');

      await cancel(id).expect(204);
      answer.reject(new ScryfallUnavailableError(503));
      await app.close();

      expect(errors).not.toHaveBeenCalled();
      app = await startApp();
      expect(scryfall.search).toHaveBeenCalledTimes(4);
    });

    it('posts no announcement', async () => {
      const { body: webhook } = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({
          name: '#roto-main',
          url: 'https://discord.com/api/webhooks/1234567890/secret-token',
        })
        .expect(201);
      const id = await readyDraft([aliceCookie], 1, undefined, webhook.id);

      await cancel(id).expect(204);

      // Announcing isn't awaited, so give a stray post time to be made.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(webhookClient.post).not.toHaveBeenCalled();
    });

    it('answers one of two cancels at once with 404, not a conflict', async () => {
      const id = await readyDraft([aliceCookie]);
      const carolCookie = await signIn(carol);

      const answers = await Promise.all([cancel(id), cancel(id, carolCookie)]);

      expect(answers.map((res) => res.status)).toEqual(
        expect.arrayContaining([204, 404]),
      );
    });
  });

  describe('pick import preview', () => {
    function preview(id: string, csv: unknown, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/pick-import/preview`)
        .set('Cookie', cookie)
        .send({ csv });
    }

    /** Made up: 'Ann' and 'Ben' are not the draft's players' names. */
    const csv = [
      ',Ann,Ben,',
      '->,ash golem,"Brine Wisp",',
      ',,Cinder Hound,<-',
    ].join('\n');
    const cards = ['Ash Golem', 'Brine Wisp', 'Cinder Hound', 'Dusk Heron'];

    it('pairs columns with seats by position, counts the picks and names the next turn', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

      const answer = await preview(id, csv).expect(200);

      expect(answer.body).toEqual({
        seats: [
          { column: 'Ann', player: 'Alice' },
          { column: 'Ben', player: 'Bob' },
        ],
        picks: 3,
        next: { pick: 4, player: 'Alice' },
      });
    });

    it('changes nothing in the draft', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
      const before = await getDraft(id).expect(200);

      await preview(id, csv).expect(200);

      expect((await getDraft(id).expect(200)).body).toEqual(before.body);
      const picks = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(picks.body).toEqual([]);
    });

    it('reports every problem in the file, with nothing changed', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);

      const refused = await preview(
        id,
        ',Ann,Ben,\n->,Ash Golem,Fen Lurker,\n,Ash Golem,,<-',
      ).expect(422);

      expect(refused.body).toEqual({
        error: 'invalid-pick-import',
        message: 'This file can’t be imported.',
        problems: [
          'Round 2 has no pick for Ben, but later picks are filled in.',
          'Fen Lurker isn’t in this draft’s pool.',
          'Ash Golem appears more than once.',
        ],
      });
    });

    it('is for the organizer and app admins, not other role-holders', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);

      await preview(id, csv, bobCookie).expect(403);
      await preview(id, csv, await signIn(carol)).expect(200);
    });

    it('answers 404 for a draft that does not exist', async () => {
      await preview('no-such-draft', csv).expect(404);
    });

    it('refuses a draft that has left the lobby', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
      await start(id).expect(200);

      const refused = await preview(id, csv).expect(409);

      expect(refused.body.error).toBe('draft-started');
    });

    it('refuses until the pool snapshot is complete', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
      await app
        .get(PrismaService)
        .draft.update({ where: { id }, data: { snapshotState: 'Running' } });

      const refused = await preview(id, csv).expect(409);

      expect(refused.body.error).toBe('pool-not-ready');
    });

    it('refuses a draft that fails the start checks', async () => {
      const tooFew = await readyDraft([aliceCookie], 1, cards);
      expect((await preview(tooFew, csv).expect(409)).body.error).toBe(
        'player-count',
      );

      const tooBig = await readyDraft(
        [aliceCookie, await signIn(bob)],
        3,
        cards,
      );
      expect((await preview(tooBig, csv).expect(409)).body.error).toBe(
        'pool-too-small',
      );
    });

    it('refuses a file over the size limit', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

      const refused = await preview(id, `${csv}\n${' '.repeat(70_000)}`).expect(
        413,
      );

      expect(refused.body.error).toBe('file-too-large');
    });

    it('refuses a request with no file text', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

      await preview(id, undefined).expect(400);
    });
  });

  describe('live updates', () => {
    const sockets: Socket[] = [];

    beforeEach(async () => {
      await app.listen(0);
    });

    afterEach(() => {
      for (const socket of sockets.splice(0)) socket.disconnect();
    });

    /** A Socket.IO client for draft `draftId`, not yet connected. */
    async function socketFor(
      draftId: string,
      cookie?: string,
    ): Promise<Socket> {
      const socket = io(await app.getUrl(), {
        path: '/api/socket.io',
        transports: ['websocket'],
        auth: { draftId },
        extraHeaders: cookie ? { Cookie: cookie } : {},
        reconnection: false,
      });
      sockets.push(socket);
      return socket;
    }

    /** A signed-in client viewing draft `draftId`, once connected. */
    async function watch(draftId: string, cookie: string) {
      const socket = await socketFor(draftId, cookie);
      const changes: DraftView[] = [];
      socket.on('changed', (draft) => changes.push(draft));
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
      });
      return changes;
    }

    it('tells everyone viewing a draft that it was cancelled', async () => {
      const id = await readyDraft([aliceCookie]);
      const socket = await socketFor(id, await signIn(bob));
      const cancelled = vi.fn();
      socket.on('cancelled', cancelled);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      await request(app.getHttpServer())
        .delete(`/api/drafts/${id}`)
        .set('Cookie', aliceCookie)
        .expect(204);

      await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce());
    });

    it('refuses a socket without a live session', async () => {
      const socket = await socketFor('any-draft');

      const error = await new Promise<Error>((resolve) =>
        socket.on('connect_error', resolve),
      );
      expect(error.message).toBe('unauthorized');
      expect(socket.connected).toBe(false);
    });

    it('pushes the draft to its viewers after each pick', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      const bobSees = await watch(id, bobCookie);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);

      await vi.waitFor(() =>
        expect(bobSees).toEqual([
          expect.objectContaining({
            id,
            state: 'Drafting',
            turn: { pick: 2, round: 1, playerId: bob.id },
          }),
        ]),
      );
    });

    it('pushes the draft to its viewers after an undo, with the turn back', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);
      const bobSees = await watch(id, bobCookie);

      await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/picks/1`)
        .set('Cookie', aliceCookie)
        .expect(200);

      await vi.waitFor(() =>
        expect(bobSees).toEqual([
          expect.objectContaining({
            id,
            turn: { pick: 1, round: 1, playerId: alice.id },
          }),
        ]),
      );
    });

    it('pushes the draft to its viewers when it is paused and resumed', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      const bobSees = await watch(id, bobCookie);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/pause`)
        .set('Cookie', aliceCookie)
        .expect(200);
      await vi.waitFor(() => expect(bobSees).toHaveLength(1));
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/resume`)
        .set('Cookie', aliceCookie)
        .expect(200);

      await vi.waitFor(() =>
        expect(bobSees.map((draft) => draft.state)).toEqual([
          'Paused',
          'Drafting',
        ]),
      );
    });

    it('pushes the draft to its viewers when it is closed and reopened', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      const bobSees = await watch(id, bobCookie);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/close`)
        .set('Cookie', aliceCookie)
        .expect(200);
      await vi.waitFor(() => expect(bobSees).toHaveLength(1));
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/reopen`)
        .set('Cookie', aliceCookie)
        .expect(200);

      await vi.waitFor(() =>
        expect(bobSees.map((draft) => draft.state)).toEqual([
          'Closed',
          'Drafting',
        ]),
      );
    });

    it('pushes the draft after a pick with its cascade made, so viewers see every pick', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/queue`)
        .set('Cookie', bobCookie)
        .send({ oracleId: 'lava-spike-oracle' })
        .expect(200);
      await start(id).expect(200);
      const carolSees = await watch(id, await signIn(carol));

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .send({ oracleId: 'shock-oracle' })
        .expect(200);

      await vi.waitFor(() =>
        expect(carolSees).toEqual([
          expect.objectContaining({
            turn: { pick: 3, round: 2, playerId: bob.id },
          }),
        ]),
      );
    });

    it('pushes the draft’s webhook by name only', async () => {
      const webhook = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({
          name: '#roto-main',
          url: 'https://discord.com/api/webhooks/1234567890/secret-token',
        })
        .expect(201);
      allOnArena('t:dragon c:r');
      const { body } = await createDraft({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
        webhookId: webhook.body.id,
      }).expect(201);
      const aliceSees = await watch(body.id, aliceCookie);

      await request(app.getHttpServer())
        .post(`/api/drafts/${body.id}/players`)
        .set('Cookie', await signIn(bob))
        .expect(201);

      await vi.waitFor(() => expect(aliceSees).toHaveLength(1));
      expect(aliceSees[0].webhook).toEqual({
        id: webhook.body.id,
        name: '#roto-main',
      });
      expect(JSON.stringify(aliceSees)).not.toContain('secret-token');
    });

    it('numbers each version of a draft, so viewers can tell which is newest', async () => {
      const id = await readyDraft([]);
      const bobCookie = await signIn(bob);
      const before = (await getDraft(id).expect(200)).body.version as number;

      const joined = await request(app.getHttpServer())
        .post(`/api/drafts/${id}/players`)
        .set('Cookie', bobCookie)
        .expect(201);
      const left = await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/players/me`)
        .set('Cookie', bobCookie)
        .expect(200);

      expect(joined.body.version).toBeGreaterThan(before);
      expect(left.body.version).toBeGreaterThan(joined.body.version);
    });

    it('pushes lobby changes, but only to that draft’s viewers', async () => {
      const id = await readyDraft([]);
      const other = await readyDraft([]);
      const bobCookie = await signIn(bob);
      const bobSees = await watch(id, bobCookie);
      const bobSeesOther = await watch(other, bobCookie);

      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/players`)
        .set('Cookie', aliceCookie)
        .expect(201);

      await vi.waitFor(() =>
        expect(bobSees).toEqual([
          expect.objectContaining({
            id,
            players: [expect.objectContaining({ id: alice.id })],
          }),
        ]),
      );
      expect(bobSeesOther).toEqual([]);
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
