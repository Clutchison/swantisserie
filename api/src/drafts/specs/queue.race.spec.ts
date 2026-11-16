import type { QueueView } from 'contract';
import type { Response } from 'supertest';
import {
  aliceThenBob,
  answered,
  describeRaces,
  planOf,
  queueOf,
  race,
  raceBehindLongCommit,
} from './race-harness.js';
import {
  aliceCookie,
  bobCookie,
  carol,
  dave,
  enqueue,
  fourCards,
  moveQueued,
  pick,
  pickLogLines,
  poolCardIds,
  queue,
  queuePaused,
  readyDraft,
  reorderQueue,
  setQueuePaused,
  setQueuePicking,
  setStealBehavior,
  signIn,
  start,
  undo,
} from './harness.js';

/**
 * The queue, by name, with whether it is queue paused and what each loss on
 * its Queue notice did to it.
 */
const shownQueue = (view: QueueView) => ({
  cards: view.cards.map((card) => card.name),
  lost: view.lost.map((card) => `${card.name}: ${card.queueLoss}`),
  queuePaused: view.queuePaused,
});

/** What a queue change answered: the queue it shows, or its refusal. */
const answeredQueue = (res: Response) =>
  res.status === 200 ? shownQueue(res.body as QueueView) : answered(res);

/** Alice's queue as `shownQueue` gives it. */
const alicesQueue = async (id: string) =>
  shownQueue((await queue(id, aliceCookie).expect(200)).body as QueueView);

/** The pick log once Bob has made his second pick, Lava Spike. */
const throughBobsSecond = [
  'Alice: Shock',
  'Bob: Lightning Bolt',
  'Bob: Lava Spike',
];

describeRaces('queue changes against a cascade', () => {
  /**
   * A started draft of Alice then Bob, two picks each, on Bob's second
   * turn: the next is Alice's. Alice picked Shock, and Bob Lightning Bolt.
   */
  async function bobsSecondTurn(cards = fourCards) {
    const draft = await aliceThenBob(cards);
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

    expect([
      {
        queued: 200,
        log: [...throughBobsSecond, 'Alice: Skewer the Critics'],
        queue: { cards: [], lost: [] },
      },
      {
        queued: '409 your-turn',
        log: throughBobsSecond,
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
    expect(await pickLogLines(id)).toEqual(throughBobsSecond);
  });

  it('reorders a queue to put first the card the cascade then picks, or is refused once the cascade has completed the draft', async () => {
    const { id, ids } = await bobsSecondTurn([...fourCards, 'Fireblast']);
    await enqueue(id, ids['Skewer the Critics']).expect(200);
    await enqueue(id, ids.Fireblast).expect(200);

    const [picked, reordered] = await race(
      () => pick(id, ids['Lava Spike'], bobCookie),
      () => reorderQueue(id, [ids.Fireblast, ids['Skewer the Critics']]),
    );

    expect([
      {
        reordered: 200,
        log: [...throughBobsSecond, 'Alice: Fireblast'],
        queue: { cards: ['Skewer the Critics'], lost: [] },
      },
      {
        // The cascade's pick is the draft's last, so the reorder finds it complete.
        reordered: '409 draft-complete',
        log: [...throughBobsSecond, 'Alice: Skewer the Critics'],
        queue: { cards: ['Fireblast'], lost: [] },
      },
    ]).toContainEqual({
      reordered: answered(reordered),
      log: await pickLogLines(id),
      queue: await queueOf(id, aliceCookie),
    });
    expect(picked.status).toBe(200);
  });

  it('moves a queued copy to the sideboard before the cascade picks it there, or is refused once the cascade has picked it', async () => {
    const { id, ids } = await bobsSecondTurn();
    await enqueue(id, ids['Skewer the Critics']).expect(200);

    const [picked, moved] = await race(
      () => pick(id, ids['Lava Spike'], bobCookie),
      () => moveQueued(id, ids['Skewer the Critics'], 'Sideboard'),
    );

    const { mainboard, sideboard } = await planOf(id, aliceCookie);
    expect([
      {
        moved: 200,
        mainboard: ['Shock'],
        sideboard: ['Skewer the Critics'],
      },
      {
        moved: '409 not-queued',
        mainboard: ['Shock', 'Skewer the Critics'],
        sideboard: [],
      },
    ]).toContainEqual({
      moved: answered(moved),
      mainboard: mainboard.map((card) => card.name),
      sideboard: sideboard.map((card) => card.name),
    });
    expect(picked.status).toBe(200);
    expect(await pickLogLines(id)).toEqual([
      ...throughBobsSecond,
      'Alice: Skewer the Critics',
    ]);
  });

  it('queues a card once a cascade committing after Prisma’s default timeout has picked', async () => {
    // Dave neither picks nor is picked for, so only the lock holds his
    // change back, until the cascade commits.
    const carolCookie = await signIn(carol);
    const daveCookie = await signIn(dave);
    const id = await readyDraft(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      1,
      fourCards,
    );
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);

    const [picked, queued] = await raceBehindLongCommit(
      () => pick(id, ids.Shock),
      () => enqueue(id, ids['Skewer the Critics'], daveCookie),
    );

    expect(picked.status).toBe(200);
    expect(answered(queued)).toBe(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
    expect(await queueOf(id, daveCookie)).toEqual({
      cards: ['Skewer the Critics'],
      lost: [],
    });
  });
});

describeRaces('setting a queue picking on the player’s turn', () => {
  /**
   * A started draft of Alice then Bob, two picks each, on Bob's first turn:
   * Alice picked Shock, and Bob's queue, paused, holds Lava Spike then
   * Skewer the Critics.
   */
  async function bobsTurnPaused() {
    const draft = await aliceThenBob();
    const { id, ids } = draft;
    await setQueuePaused(id, true, bobCookie).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    return draft;
  }

  it('picks the confirmed cards, refusing a pick by hand then, or is refused once the hand pick has changed what the queue would pick', async () => {
    const { id, ids } = await bobsTurnPaused();

    const [picking, picked] = await race(
      () =>
        setQueuePicking(
          id,
          [ids['Lava Spike'], ids['Skewer the Critics']],
          bobCookie,
        ),
      () => pick(id, ids['Lightning Bolt'], bobCookie),
    );

    expect([
      {
        picking: 200,
        picked: '409 not-your-turn',
        log: ['Alice: Shock', 'Bob: Lava Spike', 'Bob: Skewer the Critics'],
        queuePaused: false,
      },
      {
        picking: '409 queue-picks-changed',
        picked: 200,
        log: ['Alice: Shock', 'Bob: Lightning Bolt'],
        queuePaused: true,
      },
    ]).toContainEqual({
      picking: answered(picking),
      picked: answered(picked),
      log: await pickLogLines(id),
      queuePaused: await queuePaused(id, bobCookie),
    });
  });

  it('pauses a queue once the cascade has picked from it, or stops the cascade at it', async () => {
    // Three picks each, so the draft is still on once the cascade has picked.
    const id = await readyDraft([aliceCookie, bobCookie], 3, [
      ...fourCards,
      'Fireblast',
      'Rift Bolt',
    ]);
    await start(id).expect(200);
    const ids = await poolCardIds(id);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await enqueue(id, ids['Skewer the Critics']).expect(200);

    const [picked, pause] = await race(
      () => pick(id, ids['Lava Spike'], bobCookie),
      () => setQueuePaused(id, true),
    );

    const pickedThenQueuePaused = { cards: [], lost: [], queuePaused: true };
    const queuePausedFirst = {
      cards: ['Skewer the Critics'],
      lost: [],
      queuePaused: true,
    };
    expect([
      {
        pause: pickedThenQueuePaused,
        log: [...throughBobsSecond, 'Alice: Skewer the Critics'],
        queue: pickedThenQueuePaused,
      },
      {
        pause: queuePausedFirst,
        log: throughBobsSecond,
        queue: queuePausedFirst,
      },
    ]).toContainEqual({
      pause: answeredQueue(pause),
      log: await pickLogLines(id),
      queue: await alicesQueue(id),
    });
    expect(picked.status).toBe(200);
  });

  it('sets the steal behavior before a pick loses a card from the queue, or after, losing it under the old one', async () => {
    const { id, ids } = await aliceThenBob();
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await enqueue(id, ids['Lava Spike']).expect(200);
    await enqueue(id, ids['Skewer the Critics']).expect(200);

    const [picked, set] = await race(
      () => pick(id, ids['Lava Spike'], bobCookie),
      () => setStealBehavior(id, 'PickNext'),
    );

    const lostUnderPauseQueueThenSet = {
      cards: ['Skewer the Critics'],
      lost: ['Lava Spike: QueuePaused'],
      queuePaused: true,
    };
    expect([
      {
        // Set first: lost under pick next, the queue stays queue picking, so
        // the cascade picks its next card.
        set: {
          cards: ['Lava Spike', 'Skewer the Critics'],
          lost: [],
          queuePaused: false,
        },
        log: [...throughBobsSecond, 'Alice: Skewer the Critics'],
        queue: {
          cards: [],
          lost: ['Lava Spike: StayedQueuePicking'],
          queuePaused: false,
        },
      },
      {
        // Lost first, under pause queue: the queue is queue paused.
        set: lostUnderPauseQueueThenSet,
        log: throughBobsSecond,
        queue: lostUnderPauseQueueThenSet,
      },
    ]).toContainEqual({
      set: answeredQueue(set),
      log: await pickLogLines(id),
      queue: await alicesQueue(id),
    });
    expect(picked.status).toBe(200);
  });

  it('picks from the queue, refusing an undo of the pick before, or picks nothing once the undo has taken the turn back', async () => {
    const { id, ids } = await bobsTurnPaused();

    const [picking, undone] = await race(
      () =>
        setQueuePicking(
          id,
          [ids['Lava Spike'], ids['Skewer the Critics']],
          bobCookie,
        ),
      () => undo(id, 1),
    );

    expect([
      {
        undone: '409 not-latest',
        log: ['Alice: Shock', 'Bob: Lava Spike', 'Bob: Skewer the Critics'],
        queue: { cards: [], lost: [] },
      },
      {
        undone: 200,
        log: [],
        queue: { cards: ['Lava Spike', 'Skewer the Critics'], lost: [] },
      },
    ]).toContainEqual({
      undone: answered(undone),
      log: await pickLogLines(id),
      queue: await queueOf(id, bobCookie),
    });
    expect(picking.status).toBe(200);
  });
});
