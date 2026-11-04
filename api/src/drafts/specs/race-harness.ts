import type { PlanView, QueueView } from 'contract';
import type { Response } from 'supertest';
import {
  raceServer,
  startRaceDatabase,
  type RaceDatabase,
} from '../../testing/race-database.js';
import {
  aliceCookie,
  bob,
  fourCards,
  plan,
  poolCardIds,
  queue,
  readyDraft,
  signIn,
  start,
  useDraftsApp,
} from './harness.js';

/**
 * How long a raced transaction's COMMIT waits for the other's. Two that
 * don't wait on each other's locks both get there well within it; one
 * holding a lock the other waits on commits once it runs out.
 */
const HOLD_MS = 1_000;

let database: RaceDatabase;

/** `session=<token>` for Bob, signed in before each race spec. */
export let bobCookie: string;

/**
 * Describes races of two requests at once, each a transaction holding the
 * draft row lock or the player row lock, on a real Postgres with a pool of
 * several connections. `race` holds the transactions' COMMITs back until
 * both have done their reads and writes, so without the lock both would
 * act on what they read before the other's change. Each spec checks the end
 * state is one that taking the two one at a time, in either order, leaves.
 *
 * Skipped unless RACE_DATABASE_URL names a local Postgres server; see
 * `startRaceDatabase`. Alice and Bob are signed in.
 */
export function describeRaces(name: string, specs: () => void) {
  describe.skipIf(!raceServer(process.env))(
    `${name}, raced on a real Postgres`,
    () => {
      useDraftsApp(async () => (database = await startRaceDatabase()));
      beforeEach(async () => {
        bobCookie = await signIn(bob);
      });
      specs();
    },
  );
}

/** Sends `requests` at once, holding their commits back as `describeRaces` says. */
export function race(...requests: (() => PromiseLike<Response>)[]) {
  database.holdCommits(requests.length, HOLD_MS);
  return Promise.all(requests.map((send) => send()));
}

/** The answer's status and, for a refusal, its error. */
export const answered = (res: Response) =>
  res.status === 200 ? 200 : `${res.status} ${res.body.error}`;

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
