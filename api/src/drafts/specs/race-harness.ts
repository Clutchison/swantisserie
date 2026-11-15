import type { PlanView, QueueView } from 'contract';
import type { Response } from 'supertest';
import type { TestAppOptions } from '../../testing/app.js';
import type { CommitRelease } from '../../testing/database-proxy.js';
import {
  raceServer,
  startRaceDatabase,
  type RaceDatabase,
} from '../../testing/race-database.js';
import {
  aliceCookie,
  bobCookie,
  fourCards,
  plan,
  poolCardIds,
  queue,
  readyDraft,
  start,
  useBob,
  useDraftsApp,
} from './harness.js';

/**
 * How long a raced transaction's COMMIT waits for the other's. Two that
 * don't wait on each other's locks both get there well within it; one
 * holding a lock the other waits on commits once it runs out.
 */
const HOLD_MS = 1_000;

let database: RaceDatabase;

/**
 * Describes races of two requests at once, each a transaction holding a
 * row lock, such as the draft's, a player's or a webhook's, on a real
 * Postgres with a pool of several connections. `race` holds the
 * transactions' COMMITs back until
 * both have done their reads and writes, so without the lock both would
 * act on what they read before the other's change. Each spec checks the end
 * state is one that taking the two one at a time, in either order, leaves.
 *
 * Skipped unless RACE_DATABASE_URL names a local Postgres server; see
 * `startRaceDatabase`. Alice is signed in, and Bob as `useBob` signs him
 * in. `overrides` are values provided in place of the app's own providers,
 * or of the fakes and settings the harness provides.
 */
export function describeRaces(
  name: string,
  specs: () => void,
  { overrides }: { overrides?: TestAppOptions['overrides'] } = {},
) {
  describe.skipIf(!raceServer(process.env))(
    `${name}, raced on a real Postgres`,
    () => {
      useDraftsApp({
        startDatabase: async () => (database = await startRaceDatabase()),
        overrides,
      });
      useBob();
      specs();
    },
  );
}

/** Sends `requests` at once, holding their commits back as `describeRaces` says. */
export function race(...requests: (() => PromiseLike<Response>)[]) {
  return raceReleasing({ order: 'together' }, requests);
}

/**
 * How long, under `raceLastCommitFirst`, each held COMMIT waits after the
 * one before it: long enough for that request to answer, its push sent.
 */
const COMMIT_GAP_MS = 300;

/**
 * As `race`, but once the commits are let through, the request whose COMMIT
 * arrived last commits first, and the other `COMMIT_GAP_MS` later, so the
 * first to get there commits after the other has answered. Without a lock
 * between them, that one acts on what it read before the other's change,
 * and the other answers before that one's change is committed.
 */
export function raceLastCommitFirst(
  ...requests: (() => PromiseLike<Response>)[]
) {
  return raceReleasing({ order: 'last-first', gapMs: COMMIT_GAP_MS }, requests);
}

/**
 * How long `raceBehindLongCommit` holds the first request's COMMIT: past
 * Prisma's 5 s default transaction timeout, as a long cascade runs.
 */
const LONG_HOLD_MS = 6_000;

/**
 * Sends `first`, and once its COMMIT is held back, `waiting`, which so
 * waits on any lock `first` holds. `first` commits after `LONG_HOLD_MS`,
 * then `waiting` goes on. Its transaction has been open longer than
 * Prisma's default timeout by then, so it rolls back unless given longer.
 * Slower than `race`: only for a change that waits on a long pick.
 */
export async function raceBehindLongCommit(
  first: () => PromiseLike<Response>,
  waiting: () => PromiseLike<Response>,
) {
  database.holdCommits(2, LONG_HOLD_MS);
  const held = database.commitHeld();
  // Supertest sends a request only once something awaits it.
  const firstAnswer = Promise.resolve(first());
  await held;
  return Promise.all([firstAnswer, waiting()]);
}

/** Sends `requests` at once, holding their commits back until `release`. */
function raceReleasing(
  release: CommitRelease,
  requests: (() => PromiseLike<Response>)[],
) {
  database.holdCommits(requests.length, HOLD_MS, release);
  return Promise.all(requests.map((send) => send()));
}

/** The answer's status, 200 or 201, or for a refusal its status and error. */
export const answered = (res: Response) =>
  res.status === 200 || res.status === 201
    ? res.status
    : `${res.status} ${res.body.error}`;

/** What `answered` says of each of `answers`, the 200 first. */
export const sortedAnswers = (answers: Response[]) =>
  answers.map(answered).sort((a, b) => String(a).localeCompare(String(b)));

/**
 * A started draft of Alice then Bob, two picks each, over `cards`, with its
 * pool card ids by name.
 */
export async function aliceThenBob(cards = fourCards) {
  const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
  await start(id).expect(200);
  return { id, ids: await poolCardIds(id) };
}

/** The player's plan. */
export async function planOf(id: string, cookie: string) {
  return (await plan(id, cookie).expect(200)).body as PlanView;
}

/**
 * The cards on the player's mainboard, by name, marking those unpicked.
 */
export async function mainboard(id: string, cookie: string) {
  return (await planOf(id, cookie)).mainboard.map(
    (card) => `${card.name}${card.picked ? '' : ' (unpicked)'}`,
  );
}

/** The player's queue, and what its Queue notice lists, by name. */
export async function queueOf(id: string, cookie: string) {
  const view = (await queue(id, cookie).expect(200)).body as QueueView;
  return {
    cards: view.cards.map((card) => card.name),
    lost: view.lost.map((card) => card.name),
  };
}
