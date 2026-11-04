import type { PlanView, QueueView } from 'contract';
import type { Response } from 'supertest';
import {
  raceServer,
  startRaceDatabase,
  type RaceDatabase,
} from '../../testing/race-database.js';
import {
  aliceCookie,
  addToPlan,
  bob,
  carol,
  enqueue,
  fourCards,
  pick,
  pickLogLines,
  plan,
  poolCardIds,
  queue,
  readyDraft,
  reorderQueue,
  signIn,
  start,
  undo,
  useDraftsApp,
} from './harness.js';

/**
 * How long a raced transaction's COMMIT waits for the other's. Two that
 * don't wait on each other's locks both get there well within it; one
 * holding a lock the other waits on commits once it runs out.
 */
const HOLD_MS = 1_000;

/**
 * Two requests at once, each a transaction holding the draft row lock (or
 * the player row lock), on a real Postgres with a pool of several
 * connections. Each race holds the transactions' COMMITs back until both
 * have done their reads and writes, so without the lock both would act on
 * what they read before the other's change. Each spec checks the end state
 * is one that taking the two one at a time, in either order, leaves.
 */
describe.skipIf(!raceServer(process.env))('races, on a real Postgres', () => {
  let database: RaceDatabase;
  useDraftsApp(async () => (database = await startRaceDatabase()));

  let bobCookie: string;
  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  /** Sends `requests` at once, holding their commits back as above. */
  function race(...requests: (() => PromiseLike<Response>)[]) {
    database.holdCommits(requests.length, HOLD_MS);
    return Promise.all(requests.map((send) => send()));
  }

  /** Each answer's status and, for a refusal, its error. */
  const answered = (res: Response) =>
    res.status === 200 ? 200 : `${res.status} ${res.body.error}`;

  /** What `answered` says of each of `answers`, the 200 first. */
  const sortedAnswers = (all: Response[]) =>
    all.map(answered).sort((a, b) => String(a).localeCompare(String(b)));

  /** A started draft of Alice then Bob, two picks each, over `cards`. */
  async function startedDraft(cards = fourCards) {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    return { id, ids: await poolCardIds(id) };
  }

  /** The names of the cards on the player's mainboard. */
  async function mainboard(id: string, cookie: string) {
    const { body } = await plan(id, cookie).expect(200);
    return (body as PlanView).mainboard.map(
      (card) => `${card.name}${card.picked ? '' : ' (unpicked)'}`,
    );
  }

  /** The player's queue, and what its Queue notice lists, by name. */
  async function queueOf(id: string, cookie: string) {
    const { body } = await queue(id, cookie).expect(200);
    const view = body as QueueView;
    return {
      cards: view.cards.map((card) => card.name),
      lost: view.lost.map((card) => card.name),
    };
  }

  describe('pick against pick', () => {
    it('takes one of a player’s two picks of different cards in one turn', async () => {
      const { id, ids } = await startedDraft();
      const cards = ['Shock', 'Lightning Bolt'];

      const answers = await race(
        () => pick(id, ids[cards[0]]),
        () => pick(id, ids[cards[1]]),
      );

      const landed = cards[answers.findIndex((res) => res.status === 200)];
      expect(sortedAnswers(answers)).toEqual([200, '409 not-your-turn']);
      expect(await pickLogLines(id)).toEqual([`Alice: ${landed}`]);
      expect(await mainboard(id, aliceCookie)).toEqual([landed]);
    });

    it('takes a pick sent twice at once only once', async () => {
      const { id, ids } = await startedDraft();

      const answers = await race(
        () => pick(id, ids.Shock),
        () => pick(id, ids.Shock),
      );

      expect(sortedAnswers(answers)).toEqual([200, '409 not-your-turn']);
      expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
      expect(await mainboard(id, aliceCookie)).toEqual(['Shock']);
    });
  });

  it('pick against undo: either the pick lands on the pick before it, or the undo takes that back and the pick is refused', async () => {
    const { id, ids } = await startedDraft();
    await pick(id, ids.Shock).expect(200);

    const [picked, undone] = await race(
      () => pick(id, ids['Lightning Bolt'], bobCookie),
      () => undo(id, 1),
    );

    expect([
      {
        picked: 200,
        undone: '409 not-latest',
        log: ['Alice: Shock', 'Bob: Lightning Bolt'],
        alice: ['Shock'],
        bob: ['Lightning Bolt'],
      },
      {
        picked: '409 not-your-turn',
        undone: 200,
        log: [],
        alice: [],
        bob: [],
      },
    ]).toContainEqual({
      picked: answered(picked),
      undone: answered(undone),
      log: await pickLogLines(id),
      alice: await mainboard(id, aliceCookie),
      bob: await mainboard(id, bobCookie),
    });
  });

  it('undo against undo: an undo sent twice takes back one pick', async () => {
    const { id, ids } = await startedDraft();
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    const answers = await race(
      () => undo(id, 2),
      () => undo(id, 2),
    );

    expect(sortedAnswers(answers)).toEqual([200, '409 not-latest']);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    expect(await mainboard(id, aliceCookie)).toEqual(['Shock']);
    expect(await mainboard(id, bobCookie)).toEqual([]);
  });

  describe('queue change against a cascade', () => {
    /** A started draft where it is Bob's second turn, with Alice's next. */
    async function bobsSecondTurn(cards = fourCards) {
      const draft = await startedDraft(cards);
      await pick(draft.id, draft.ids.Shock).expect(200);
      await pick(draft.id, draft.ids['Lightning Bolt'], bobCookie).expect(200);
      return draft;
    }

    it('queues a card the cascade then picks, or is refused on the turn the pick brings', async () => {
      const { id, ids } = await bobsSecondTurn();

      const [picked, queued] = await race(
        () => pick(id, ids['Lava Spike'], bobCookie),
        () => enqueue(id, ids['Skewer the Critics']),
      );

      const before = ['Alice: Shock', 'Bob: Lightning Bolt', 'Bob: Lava Spike'];
      expect([
        {
          queued: 200,
          log: [...before, 'Alice: Skewer the Critics'],
          queue: { cards: [], lost: [] },
        },
        {
          queued: '409 your-turn',
          log: before,
          queue: { cards: [], lost: [] },
        },
      ]).toContainEqual({
        queued: answered(queued),
        log: await pickLogLines(id),
        queue: await queueOf(id, aliceCookie),
      });
      expect(picked.status).toBe(200);
    });

    it('queues a card the pick then takes, listing it on the Queue notice, or is refused on the turn the pick brings', async () => {
      const { id, ids } = await bobsSecondTurn();

      const [picked, queued] = await race(
        () => pick(id, ids['Lava Spike'], bobCookie),
        () => enqueue(id, ids['Lava Spike']),
      );

      expect([
        { queued: 200, queue: { cards: [], lost: ['Lava Spike'] } },
        { queued: '409 your-turn', queue: { cards: [], lost: [] } },
      ]).toContainEqual({
        queued: answered(queued),
        queue: await queueOf(id, aliceCookie),
      });
      expect(picked.status).toBe(200);
      expect(await pickLogLines(id)).toEqual([
        'Alice: Shock',
        'Bob: Lightning Bolt',
        'Bob: Lava Spike',
      ]);
    });

    it('reorders a queue to put first the card the cascade then picks, or is refused once the cascade has picked', async () => {
      const { id, ids } = await bobsSecondTurn([...fourCards, 'Fireblast']);
      await enqueue(id, ids['Skewer the Critics']).expect(200);
      await enqueue(id, ids.Fireblast).expect(200);

      const [picked, reordered] = await race(
        () => pick(id, ids['Lava Spike'], bobCookie),
        () => reorderQueue(id, [ids.Fireblast, ids['Skewer the Critics']]),
      );

      const before = ['Alice: Shock', 'Bob: Lightning Bolt', 'Bob: Lava Spike'];
      expect([
        {
          reordered: 200,
          log: [...before, 'Alice: Fireblast'],
          queue: { cards: ['Skewer the Critics'], lost: [] },
        },
        {
          reordered: '409 queue-changed',
          log: [...before, 'Alice: Skewer the Critics'],
          queue: { cards: ['Fireblast'], lost: [] },
        },
      ]).toContainEqual({
        reordered: answered(reordered),
        log: await pickLogLines(id),
        queue: await queueOf(id, aliceCookie),
      });
      expect(picked.status).toBe(200);
    });
  });

  it('plan change against a cascade: adds a card the cascade then takes out of the plan, listing it on the Plan notice, or is refused once it is picked', async () => {
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie, carolCookie]);
    const ids = await poolCardIds(id);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    await start(id).expect(200);

    const [picked, added] = await race(
      () => pick(id, ids.Shock),
      () => addToPlan(id, ids['Lava Spike'], carolCookie),
    );

    const { body } = await plan(id, carolCookie).expect(200);
    const carols = body as PlanView;
    expect([
      { added: 200, carol: [], lost: ['Lava Spike picked by Bob'] },
      { added: '409 already-picked', carol: [], lost: [] },
    ]).toContainEqual({
      added: answered(added),
      carol: carols.mainboard.map((card) => card.name),
      lost: carols.lost.map(
        (card) => `${card.name} picked by ${card.pickedBy}`,
      ),
    });
    expect(picked.status).toBe(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
  });
});
