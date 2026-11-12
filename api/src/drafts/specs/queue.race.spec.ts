import {
  aliceThenBob,
  answered,
  bobCookie,
  describeRaces,
  queueOf,
  race,
} from './race-harness.js';
import {
  aliceCookie,
  enqueue,
  fourCards,
  pick,
  pickLogLines,
  queuePaused,
  reorderQueue,
  setQueuePaused,
  undo,
} from './harness.js';

describeRaces('queue changes against a cascade', () => {
  /** The pick log once Bob has made his second pick, Lava Spike. */
  const throughBobsSecond = [
    'Alice: Shock',
    'Bob: Lightning Bolt',
    'Bob: Lava Spike',
  ];

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
        setQueuePaused(id, false, bobCookie, [
          ids['Lava Spike'],
          ids['Skewer the Critics'],
        ]),
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

  it('picks from the queue, refusing an undo of the pick before, or picks nothing once the undo has taken the turn back', async () => {
    const { id, ids } = await bobsTurnPaused();

    const [picking, undone] = await race(
      () =>
        setQueuePaused(id, false, bobCookie, [
          ids['Lava Spike'],
          ids['Skewer the Critics'],
        ]),
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
