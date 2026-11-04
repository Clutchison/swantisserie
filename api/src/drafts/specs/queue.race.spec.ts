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
  reorderQueue,
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

  it('reorders a queue to put first the card the cascade then picks, or is refused once the cascade has picked', async () => {
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
        reordered: '409 queue-changed',
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
