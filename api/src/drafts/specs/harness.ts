import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { AdminConfig } from '../../auth/admin-config.js';
import { SessionService } from '../../auth/session.service.js';
import { DiscordConfig } from '../../discord/discord-config.js';
import { DraftNotifierRetries } from '../../discord/draft-notifier.js';
import { BotPickDelay } from '../bot-players.js';
import { WebhookClient } from '../../discord/webhook-client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ScryfallCard,
  ScryfallClient,
  ScryfallSearchPage,
} from '../../scryfall/scryfall-client.js';
import {
  startTestDatabase,
  TestDatabase,
} from '../../testing/test-database.js';

export const alice = { id: '80351110224678912', name: 'Alice' };
export const bob = { id: '80351110224678913', name: 'Bob' };
export const carol = { id: '80351110224678914', name: 'Carol' };
/** Carol is an app admin. */
const admins = new AdminConfig(carol.id);
/** Drafts' pages are at https://roto.example/drafts/:id. */
const discordConfig = new DiscordConfig({
  DISCORD_REDIRECT_URI: 'https://roto.example/api/auth/discord/callback',
});

let database: TestDatabase;
export let app: INestApplication<App>;
/** `session=<token>` for Alice, ready for a Cookie header. */
export let aliceCookie: string;
export const scryfall = {
  search: vi.fn<ScryfallClient['search']>(),
  printings: vi.fn<ScryfallClient['printings']>(),
};
export const webhookClient = { post: vi.fn<WebhookClient['post']>() };

/** Registers the hooks that give each test a fresh database and running app. */
export function useDraftsApp() {
  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
  });

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.reset();
    vi.resetAllMocks();
    await startApp();
    await signInAlice();
  });

  afterEach(async () => {
    await app.close();
  });
}

/**
 * Starts the app as `app`. `botDelayMs` is how long bots wait before picking:
 * at once, unless told otherwise.
 */
export async function startApp(botDelayMs = 0) {
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
  app = started;
}

/** Signing in through Discord is covered by the auth tests. */
export async function signIn(user: {
  id: string;
  name: string;
  avatar?: string;
}) {
  await app.get(PrismaService).user.upsert({
    where: { id: user.id },
    create: user,
    update: {},
  });
  const { token } = await app.get(SessionService).create(user.id);
  return `session=${token}`;
}

/** Signs Alice in as `aliceCookie`. */
export async function signInAlice() {
  aliceCookie = await signIn(alice);
}

/**
 * Answers searches from `results`, keyed by the exact query sent, with
 * ` page 2` etc. appended for pages after the first.
 */
export function scryfallAnswers(
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
export function card(
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

export function page(...names: string[]): ScryfallSearchPage {
  return {
    totalCards: names.length,
    hasMore: false,
    cards: names.map((name) => card(name)),
    warnings: [],
  };
}

/** The search the snapshot pages through for `poolQuery`. */
export const snapshotQuery = (poolQuery: string) =>
  `(${poolQuery}) game:arena unique:cards`;

/** A pool query whose cards are all on Arena, with a two-card pool. */
export function allOnArena(poolQuery: string) {
  scryfallAnswers({
    [poolQuery]: page('Balefire Dragon', 'Shivan Dragon'),
    [`(${poolQuery}) -in:arena`]: null,
    [snapshotQuery(poolQuery)]: page('Balefire Dragon', 'Shivan Dragon'),
  });
}

export function createDraft(body: object, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .post('/api/drafts')
    .set('Cookie', cookie)
    .send(body);
}

export function listDrafts(cookie = aliceCookie) {
  return request(app.getHttpServer()).get('/api/drafts').set('Cookie', cookie);
}

export function getDraft(id: string, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .get(`/api/drafts/${id}`)
    .set('Cookie', cookie);
}

/** The draft once its snapshot has finished, one way or the other. */
export async function snapshotted(id: string) {
  return vi.waitFor(async () => {
    const res = await getDraft(id).expect(200);
    expect(res.body.snapshot.state).not.toBe('Running');
    return res.body;
  });
}

export function pick(id: string, oracleId: unknown, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .post(`/api/drafts/${id}/picks`)
    .set('Cookie', cookie)
    .send({ oracleId });
}

/** Undoes the draft's pick `number`, by default as the organizer, Alice. */
export function undo(
  id: string,
  number: number | string,
  cookie = aliceCookie,
) {
  return request(app.getHttpServer())
    .delete(`/api/drafts/${id}/picks/${number}`)
    .set('Cookie', cookie);
}

export function queue(id: string, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .get(`/api/drafts/${id}/queue`)
    .set('Cookie', cookie);
}

export function enqueue(id: string, oracleId: unknown, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .post(`/api/drafts/${id}/queue`)
    .set('Cookie', cookie)
    .send({ oracleId });
}

/** Posts to the draft's `action` route. */
export function post(id: string, action: string, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .post(`/api/drafts/${id}/${action}`)
    .set('Cookie', cookie);
}

/** The draft's pick log, as the API answers with it. */
export function pickLog(id: string) {
  return request(app.getHttpServer())
    .get(`/api/drafts/${id}/picks`)
    .set('Cookie', aliceCookie)
    .expect(200);
}

/** The pick log as `Player: Card` lines. */
export async function pickLogLines(id: string) {
  const res = await pickLog(id);
  const names = { [alice.id]: 'Alice', [bob.id]: 'Bob' };
  return (res.body as { playerId: string; name: string }[]).map(
    (logged) => `${names[logged.playerId] ?? 'Bot'}: ${logged.name}`,
  );
}

/**
 * A draft whose pool of `cards` (three, unless told otherwise) is
 * snapshotted, joined by each of `cookies` in order.
 */
export async function readyDraft(
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

export function start(id: string, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .post(`/api/drafts/${id}/start`)
    .set('Cookie', cookie);
}
