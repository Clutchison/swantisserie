import type { BasicLand, DraftView, Platform } from 'contract';
import request from 'supertest';
import { DraftNotifier } from '../../discord/draft-notifier.js';
import { BotPickDelay, BotPickRetries } from '../bot-players.js';
import {
  ScryfallCard,
  ScryfallSearchPage,
} from '../../scryfall/scryfall-client.js';
import {
  alice,
  app,
  bob,
  carol,
  scryfall,
  signIn,
  startTestApp,
  useTestApp,
} from '../../testing/app.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { printingsAnswers } from '../../testing/scryfall-printings.js';
import { NO_BASICS, scryfallSet } from '../../testing/scryfall-sets.js';
import type { TestDatabase } from '../../testing/test-database.js';

export {
  alice,
  app,
  bob,
  carol,
  cubeCobra,
  scryfall,
  signIn,
  slowDownDatabase,
  slowQueryUnderway,
  registerWebhook,
  removeWebhook,
  renameWebhook,
  replaceWebhookUrl,
  webhookClient,
  webhookUrl,
} from '../../testing/app.js';

/** `session=<token>` for Alice, ready for a Cookie header. */
export let aliceCookie: string;

/**
 * Registers the hooks that give each test a fresh database and running app,
 * with Alice signed in. The database is PGlite, unless `startDatabase`
 * starts another.
 */
export function useDraftsApp(startDatabase?: () => Promise<TestDatabase>) {
  useTestApp(async () => {
    await startApp();
    await signInAlice();
  }, startDatabase);
}

/**
 * How long to allow each bot pick: on CI, other spec files share the
 * machine and can make the database slow.
 */
const WAIT_PER_BOT_PICK_MS = 2_000;

/**
 * Waits until `check` passes, allowing time for `botPicks` bot picks. The
 * test timeout (`vitest.config.ts`) must outlast the longest such wait.
 */
export function waitForBotPicks<T>(
  botPicks: number,
  check: () => T | Promise<T>,
): Promise<T> {
  return vi.waitFor(check, { timeout: botPicks * WAIT_PER_BOT_PICK_MS });
}

/**
 * Resolves once every announcement queued so far for the draft has been
 * posted, or has failed: those of a request that has answered, but not a
 * bot's pick still to come. Use before checking what was posted, or that
 * nothing was.
 */
export function announcementsSettled(draftId: string): Promise<void> {
  // Queued behind the draft's announcements, so done once they are.
  return app.get(DraftNotifier).notify(draftId, []);
}

/**
 * Starts the app as `app`. `botDelayMs` is how long bots wait before picking:
 * at once, unless told otherwise. `botRetryDelaysMs` are the waits before
 * each retry of a bot's failed pick: two retries at once, unless told
 * otherwise.
 */
export async function startApp({
  botDelayMs = 0,
  botRetryDelaysMs = [0, 0],
}: {
  botDelayMs?: number;
  botRetryDelaysMs?: readonly number[];
} = {}) {
  await startTestApp({
    overrides: [
      { provide: BotPickDelay, useValue: new BotPickDelay(botDelayMs) },
      {
        provide: BotPickRetries,
        useValue: new BotPickRetries(botRetryDelaysMs),
      },
    ],
  });
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

/**
 * Stores `printings`, Scryfall card objects of basic land printings, through
 * the refresh that asking for a land's printings starts, and waits for it to
 * finish. Each printing's set is Scryfall's `scryfallSet` of its code.
 */
export async function storePrintings(printings: ScryfallCard[]) {
  const codes = [...new Set(printings.map((printing) => printing.set))];
  scryfall.sets.mockResolvedValue(codes.map((code) => scryfallSet(code)));
  scryfallAnswers(printingsAnswers(printings));
  await request(app.getHttpServer())
    .get('/api/basic-land-printings/Plains')
    .set('Cookie', aliceCookie)
    .expect(200);
  await vi.waitFor(async () =>
    expect(await app.get(PrismaService).basicLandPrintingRefresh.count()).toBe(
      1,
    ),
  );
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
    lang: 'en',
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

/** A one-page search result of `cards`, each named or given whole. */
export function page(...cards: (string | ScryfallCard)[]): ScryfallSearchPage {
  return {
    totalCards: cards.length,
    hasMore: false,
    cards: cards.map((c) => (typeof c === 'string' ? card(c) : c)),
    warnings: [],
  };
}

/**
 * The search the snapshot pages through for `poolQuery` on `platform`,
 * which leaves the basic lands out.
 */
export const snapshotQuery = (
  poolQuery: string,
  platform: Platform = 'Arena',
) =>
  `(${poolQuery}) ${NO_BASICS} game:${platform === 'Arena' ? 'arena' : 'mtgo'} unique:cards`;

/** A pool query whose cards are all on Arena, with a two-card pool. */
export function allOnArena(poolQuery: string) {
  scryfallAnswers({
    [poolQuery]: page('Balefire Dragon', 'Shivan Dragon'),
    [`(${poolQuery}) -in:arena`]: null,
    [snapshotQuery(poolQuery)]: page('Balefire Dragon', 'Shivan Dragon'),
  });
}

/**
 * A request to `path` under `/api/drafts` as whoever is signed in with
 * `cookie`, sending `body` when there is one.
 */
export function draftsRequest(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  cookie: string,
  body?: unknown,
) {
  const req = request(app.getHttpServer())
    [method](`/api/drafts${path}`)
    .set('Cookie', cookie);
  return body === undefined ? req : req.send(body as object);
}

/**
 * Creates a draft from `body`, with the pool query `c:r` as its pool source
 * when `body` doesn't give one. Give `poolSource: undefined` to send none.
 */
export function createDraft(body: object, cookie = aliceCookie) {
  return draftsRequest('post', '', cookie, {
    poolSource: { kind: 'pool-query', poolQuery: 'c:r' },
    ...body,
  });
}

export function listDrafts(cookie = aliceCookie) {
  return draftsRequest('get', '', cookie);
}

export function getDraft(id: string, cookie = aliceCookie) {
  return draftsRequest('get', `/${id}`, cookie);
}

/** Cancels the draft. */
export function cancelDraft(id: string, cookie = aliceCookie) {
  return draftsRequest('delete', `/${id}`, cookie);
}

/** Switches the draft's announcements to webhook `webhookId`, or back to its draft channel when null. */
export function changeWebhook(
  id: string,
  webhookId: unknown,
  cookie = aliceCookie,
) {
  return draftsRequest('put', `/${id}/webhook`, cookie, { webhookId });
}

/** The draft once its snapshot has finished, one way or the other. */
export async function snapshotted(id: string) {
  return vi.waitFor(async () => {
    const res = await getDraft(id).expect(200);
    expect(res.body.snapshot.state).not.toBe('Running');
    return res.body;
  });
}

/**
 * A draft whose snapshot is waiting on Scryfall for page 2 of
 * `snapshotQuery('c:r')`, having saved page 1. `answer` settles that wait.
 */
export async function draftWithRunningSnapshot() {
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
  const created = await createDraft({
    name: 'Red',
  });
  await vi.waitFor(() =>
    expect(scryfall.search).toHaveBeenCalledWith(query, 2),
  );
  return { id: created.body.id as string, answer };
}

/** The ids of the draft's pool cards, by card name: the last copy's, for a card with copies. */
export async function poolCardIds(id: string): Promise<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(await copyIds(id)).map(([name, ids]) => [name, ids.at(-1)!]),
  );
}

/** The ids of every copy of each card in the draft's pool, by card name. */
export async function copyIds(id: string): Promise<Record<string, string[]>> {
  const res = await pool(id).expect(200);
  const copies: Record<string, string[]> = {};
  for (const card of res.body as { id: string; name: string }[]) {
    (copies[card.name] ??= []).push(card.id);
  }
  return copies;
}

/** The draft's pool. */
export function pool(id: string, cookie = aliceCookie) {
  return draftsRequest('get', `/${id}/pool`, cookie);
}

/** Joins the draft as the signed-in player. */
export function join(id: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/players`, cookie);
}

/** Leaves the draft as the signed-in player. */
export function leave(id: string, cookie = aliceCookie) {
  return draftsRequest('delete', `/${id}/players/me`, cookie);
}

/** Adds a bot to the draft; only app admins, such as Carol, may. */
export function addBot(id: string, cookie: string) {
  return draftsRequest('post', `/${id}/bots`, cookie);
}

/** Removes the bot `userId` from the draft; only app admins, such as Carol, may. */
export function removeBot(id: string, userId: string, cookie: string) {
  return draftsRequest(
    'delete',
    `/${id}/bots/${encodeURIComponent(userId)}`,
    cookie,
  );
}

/** Shuffles the draft's seat order. */
export function randomizeSeats(id: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/seats/randomize`, cookie);
}

/** Sets the draft's seat order to `playerIds`. */
export function setSeats(id: string, playerIds: unknown, cookie = aliceCookie) {
  return draftsRequest('put', `/${id}/seats`, cookie, { playerIds });
}

/** Imports the picks in `csv`, its players seated as `playerIds` lists. */
export function importPicks(
  id: string,
  csv: unknown,
  playerIds: unknown,
  cookie = aliceCookie,
) {
  return draftsRequest('post', `/${id}/pick-import`, cookie, {
    csv,
    playerIds,
  });
}

/** What importing the picks in `csv` would do, without importing them. */
export function previewPickImport(
  id: string,
  csv: unknown,
  cookie = aliceCookie,
) {
  return draftsRequest('post', `/${id}/pick-import/preview`, cookie, { csv });
}

export function pick(id: string, poolCardId: unknown, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/picks`, cookie, { poolCardId });
}

/** Undoes the draft's pick `number`, by default as the organizer, Alice. */
export function undo(
  id: string,
  number: number | string,
  cookie = aliceCookie,
) {
  return draftsRequest('delete', `/${id}/picks/${number}`, cookie);
}

export function queue(id: string, cookie = aliceCookie) {
  return draftsRequest('get', `/${id}/queue`, cookie);
}

export function enqueue(id: string, poolCardId: unknown, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/queue`, cookie, { poolCardId });
}

/** Reorders the player's queue to `poolCardIds`. */
export function reorderQueue(
  id: string,
  poolCardIds: unknown,
  cookie = aliceCookie,
) {
  return draftsRequest('put', `/${id}/queue`, cookie, { poolCardIds });
}

/** Takes a card out of the player's queue. */
export function removeFromQueue(
  id: string,
  poolCardId: string,
  cookie = aliceCookie,
) {
  return draftsRequest('delete', `/${id}/queue/${poolCardId}`, cookie);
}

/** Adds the unpicked cards in the player's plan to the end of their queue. */
export function queueUnpicked(id: string, body: unknown, cookie: string) {
  return draftsRequest('post', `/${id}/queue/unpicked`, cookie, body);
}

/** Posts to the draft's `action` route. */
export function post(id: string, action: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/${action}`, cookie);
}

/** The draft's pick log, as the API answers with it: with 200, unless told otherwise. */
export function pickLog(id: string, status = 200) {
  return draftsRequest('get', `/${id}/picks`, aliceCookie).expect(status);
}

/** The pool card ids picked, in pick order. */
export async function pickedIds(id: string): Promise<string[]> {
  return ((await pickLog(id)).body as { poolCardId: string }[]).map(
    (logged) => logged.poolCardId,
  );
}

/** The names of the cards picked, in pick order, taken from the draft's pool. */
export async function pickedNames(id: string): Promise<string[]> {
  const [log, cards] = await Promise.all([pickLog(id), pool(id).expect(200)]);
  const names = new Map(
    (cards.body as { id: string; name: string }[]).map((card) => [
      card.id,
      card.name,
    ]),
  );
  return (log.body as { poolCardId: string }[]).map((logged) => {
    const name = names.get(logged.poolCardId);
    if (name === undefined) {
      throw new Error(`Picked a card not in the pool: ${logged.poolCardId}`);
    }
    return name;
  });
}

/**
 * The pick log as `Player: Card` lines, naming the draft's bots "Bot".
 * Throws on a pick by anyone else but Alice, Bob or Carol.
 */
export async function pickLogLines(id: string) {
  const res = await pickLog(id);
  const picked = await pickedNames(id);
  const draft = (await getDraft(id).expect(200)).body as DraftView;
  const names: Record<string, string> = {
    [alice.id]: alice.name,
    [bob.id]: bob.name,
    [carol.id]: carol.name,
  };
  for (const player of draft.players) {
    if (player.isBot) names[player.id] = 'Bot';
  }
  return (res.body as { playerId: string }[]).map((logged, i) => {
    const name = names[logged.playerId];
    if (name === undefined) {
      throw new Error(`Picked by an unknown player: ${logged.playerId}`);
    }
    return `${name}: ${picked[i]}`;
  });
}

/**
 * A draft whose pool of `cards` (three, unless told otherwise; each named,
 * or given whole to set its fields) is snapshotted, joined by each of
 * `cookies` in order.
 *
 * Before a spec starts it: a start needs two players and a pool of at
 * least `cookies.length * picksPerPlayer` cards; a pick import empties
 * every queue, so queue after importing; and a bot picks at random, so
 * pin `Math.random` (0 picks the first available card by name).
 *
 * Once started: every card given by name has the same mana value, so anything the
 * API sorts by mana value comes out sorted by name; a queued card is picked
 * in the cascade as soon as its player's turn comes, so queue only what the
 * spec means to have picked; and a bot picks again at once when its pick is
 * undone (its delay is 0 here), so undo a player's pick to see an undo.
 */
export async function readyDraft(
  cookies: string[],
  picksPerPlayer = 1,
  cards: (string | ScryfallCard)[] = ['Shock', 'Lightning Bolt', 'Lava Spike'],
  webhookId: string | null = null,
) {
  scryfallAnswers({
    'c:r': page(...cards),
    '(c:r) -in:arena': null,
    [snapshotQuery('c:r')]: page(...cards),
  });
  const created = await createDraft({
    name: 'Red',
    picksPerPlayer,
    webhookId,
  }).expect(201);
  const id = created.body.id as string;
  await snapshotted(id);
  for (const cookie of cookies) {
    await join(id, cookie).expect(201);
  }
  return id;
}

/** Four red cards, for drafts that need more than `readyDraft`'s three. */
export const fourCards = [
  'Shock',
  'Lightning Bolt',
  'Lava Spike',
  'Skewer the Critics',
];

/** A queued card, named by any pool card id: each test's draft has its own. */
export const queued = (name: string) => ({
  poolCardId: expect.any(String),
  name,
});
export const shock = queued('Shock');
export const bolt = queued('Lightning Bolt');
export const spike = queued('Lava Spike');
export const skewer = queued('Skewer the Critics');

/** Two copies of Lightning Bolt, with Shock and Lava Spike. */
export const boltCopies = [
  'Lightning Bolt',
  'Lightning Bolt',
  'Shock',
  'Lava Spike',
];

/**
 * A ready draft, as readyDraft makes, whose pool is `boltCopies` plus any
 * other `cards`. Answers with its pool card ids by name, and with the ids of
 * Lightning Bolt's two copies as `first` and `second`.
 */
export async function readyDraftWithCopies(
  cookies: string[],
  picksPerPlayer = 1,
  cards: string[] = [],
) {
  const id = await readyDraft(cookies, picksPerPlayer, [
    ...boltCopies,
    ...cards,
  ]);
  const ids = await poolCardIds(id);
  const [first, second] = (await copyIds(id))['Lightning Bolt'];
  return { id, ids, first, second };
}

/**
 * A ready draft, as readyDraftWithCopies makes, with a third copy of
 * Lightning Bolt, whose pool card ids go down in the order the snapshot
 * stores the cards. On the test database (PGlite, one connection, tables
 * truncated before each test, the pool written by one createMany) unordered
 * rows come back in the order they were stored, so a read that doesn't order
 * the pool by id offers the copies in reverse, and no test using this helper
 * passes by chance. Answers with its pool card ids by name, and with the ids
 * of Lightning Bolt's three copies as `copies`, in id order: unlike
 * readyDraftWithCopies' `first` and `second`, which are in the pool read's
 * order. Throws if any copy's id isn't one it generated, since the stored
 * order would then be random.
 */
export async function readyDraftWithCopiesOutOfIdOrder(
  cookies: string[],
  picksPerPlayer = 1,
) {
  // Every id Prisma's `uuid()` default generates (it calls
  // `globalThis.crypto.randomUUID`) while the draft is made: each one's first
  // 8 hex digits count down, the rest as random as ever.
  const randomUUID = crypto.randomUUID.bind(crypto);
  let next = 0xffffffff;
  const generatedIds = new Set<string>();
  const generated = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    const generatedId =
      `${(next--).toString(16).padStart(8, '0')}${randomUUID().slice(8)}` as ReturnType<
        typeof randomUUID
      >;
    generatedIds.add(generatedId);
    return generatedId;
  });
  try {
    const { id, ids } = await readyDraftWithCopies(cookies, picksPerPlayer, [
      'Lightning Bolt',
    ]);
    const copies = (await copyIds(id))['Lightning Bolt'].sort();
    const notGenerated = copies.filter((copy) => !generatedIds.has(copy));
    if (notGenerated.length > 0) {
      throw new Error(
        `Lightning Bolt's copies ${notGenerated.join(', ')} weren't generated by the crypto.randomUUID spy, so their stored order isn't pinned: has Prisma's uuid() default stopped calling globalThis.crypto.randomUUID?`,
      );
    }
    return { id, ids, copies };
  } finally {
    generated.mockRestore();
  }
}

export function start(id: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/start`, cookie);
}

/** Dismisses the player's Queue notice. */
export function dismissNotice(id: string, cookie = aliceCookie) {
  return draftsRequest('delete', `/${id}/queue/notice`, cookie);
}

/** Sets the player's steal behavior in the draft. */
export function setStealBehavior(
  id: string,
  behavior: unknown,
  cookie = aliceCookie,
) {
  return draftsRequest('put', `/${id}/queue/steal-behavior`, cookie, {
    stealBehavior: behavior,
  });
}

/** The player's plan in the draft. */
export function plan(id: string, cookie: string) {
  return draftsRequest('get', `/${id}/plan`, cookie);
}

/** Moves a card in the player's plan to `board`. */
export function movePlanned(
  id: string,
  poolCardId: string,
  board: unknown,
  cookie: string,
) {
  return draftsRequest('put', `/${id}/plan/${poolCardId}`, cookie, { board });
}

/** Adds an unpicked copy of a pool card to the player's plan. */
export function addToPlan(id: string, poolCardId: unknown, cookie: string) {
  return draftsRequest('post', `/${id}/plan`, cookie, { poolCardId });
}

/** Takes an unpicked card out of the player's plan. */
export function removeFromPlan(id: string, poolCardId: string, cookie: string) {
  return draftsRequest('delete', `/${id}/plan/${poolCardId}`, cookie);
}

/** Dismisses the player's Plan notice. */
export function dismissPlanNotice(id: string, cookie: string) {
  return draftsRequest('delete', `/${id}/plan/notice`, cookie);
}

/** Dismisses the player's Ready notice. */
export function dismissReadyNotice(id: string, cookie: string) {
  return draftsRequest('delete', `/${id}/plan/ready-notice`, cookie);
}

/** Sets how many copies of a basic land the player's mainboard holds. */
export function setBasic(
  id: string,
  land: string,
  count: unknown,
  cookie: string,
) {
  return draftsRequest('put', `/${id}/plan/basics/${land}`, cookie, { count });
}

/** Takes one copy of a basic land off a plan board of the player's plan. */
export function removeBasic(
  id: string,
  land: string,
  board: string,
  cookie: string,
) {
  return draftsRequest('delete', `/${id}/plan/basics/${land}/${board}`, cookie);
}

/** Takes every basic land out of the player's plan. */
export function clearBasics(id: string, cookie: string) {
  return draftsRequest('delete', `/${id}/plan/basics`, cookie);
}

/**
 * Puts `count` copies of a basic land on the sideboard of the user's plan in
 * the draft, straight into the database: no route puts a basic land on the
 * sideboard yet. Moving a copy between plan boards (#644) replaces it.
 */
export async function putBasicsOnSideboard(
  id: string,
  userId: string,
  land: BasicLand,
  count: number,
) {
  const prisma = app.get(PrismaService);
  const player = await prisma.player.findUniqueOrThrow({
    where: { draftId_userId: { draftId: id, userId } },
  });
  await prisma.plannedBasic.create({
    data: { playerId: player.id, land, board: 'Sideboard', count },
  });
}
