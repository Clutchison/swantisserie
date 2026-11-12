import {
  alice,
  bob,
  carol,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  pick,
  undo,
  enqueue,
  queue,
  pickLogLines,
  dismissNotice,
  poolCardIds,
  readyDraftWithCopies,
  post,
  fourCards,
  registerWebhook,
  setSeats,
  setStealBehavior,
  shock,
  bolt,
  spike,
  skewer,
} from './harness.js';

useDraftsApp();

describe('undo', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  it('removes the latest pick, returning its card to the pool and the turn to its player', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    const undone = await undo(id, 2).expect(200);

    expect(undone.body.turn).toEqual({
      pick: 2,
      round: 1,
      playerId: bob.id,
    });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    // Lightning Bolt is back in the pool.
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
    ]);
  });

  it('undoes only the last pick of a cascade, and makes no queued picks', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(200);
    await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await pick(id, ids.Shock).expect(200);

    const undone = await undo(id, 3).expect(200);

    // Skewer the Critics is back in Bob's queue, but it waits for him.
    expect(undone.body.turn).toEqual({ pick: 3, round: 2, playerId: bob.id });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
    expect((await queue(id, bobCookie).expect(200)).body.cards).toEqual([
      skewer,
      bolt,
    ]);
  });

  describe('of a by-hand pick of a card from the middle of its picker’s queue', () => {
    /**
     * Alice's turn comes back by an undo with Shock, Bolt and Lava Spike
     * queued, which wait for her, and she picks Bolt by hand.
     */
    async function pickedFromOwnQueue() {
      const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids['Skewer the Critics']).expect(200);
      await enqueue(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lightning Bolt']).expect(200);
      await enqueue(id, ids['Lava Spike']).expect(200);
      await undo(id, 1).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);
      return id;
    }

    it('puts the card back in the same place in that queue', async () => {
      const id = await pickedFromOwnQueue();

      await undo(id, 1).expect(200);

      expect((await queue(id).expect(200)).body.cards).toEqual([
        shock,
        bolt,
        spike,
      ]);
    });

    it('never puts the card on the picker’s Queue notice', async () => {
      const id = await pickedFromOwnQueue();
      const notice = {
        lost: [],
        cleared: [],
        restKept: false,
      };
      expect((await queue(id).expect(200)).body).toMatchObject(notice);

      await undo(id, 1).expect(200);

      expect((await queue(id).expect(200)).body).toMatchObject(notice);
    });
  });

  it('returns the card to the queues it was lost from, to be picked on the next real pick', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await enqueue(id, ids['Skewer the Critics']).expect(200);
    await pick(id, ids['Skewer the Critics'], bobCookie).expect(200);

    await undo(id, 2).expect(200);

    expect((await queue(id).expect(200)).body).toEqual({
      cards: [
        { poolCardId: ids['Skewer the Critics'], name: 'Skewer the Critics' },
      ],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
      queuePaused: false,
    });
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await pick(id, ids['Lava Spike'], bobCookie).expect(200);
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
      'Bob: Lava Spike',
      'Alice: Skewer the Critics',
    ]);
  });

  it('gives each player back only their own taken-out cards, and leaves a queue it took nothing out of alone', async () => {
    const carolCookie = await signIn(carol);
    const id = await readyDraft(
      [aliceCookie, bobCookie, carolCookie],
      1,
      fourCards,
    );
    const ids = await poolCardIds(id);
    // Bob picks last, so his queue waits through Alice's and Carol's turns.
    await setSeats(id, [alice.id, carol.id, bob.id]).expect(200);
    await start(id).expect(200);
    await pick(id, ids['Skewer the Critics']).expect(200);
    await enqueue(id, ids.Shock).expect(200);
    await enqueue(id, ids['Lightning Bolt']).expect(200);
    // Alice's turn comes back, and her queue waits for her.
    await undo(id, 1).expect(200);
    await enqueue(id, ids['Lightning Bolt'], carolCookie).expect(200);
    await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);
    await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(200);
    // Bolt leaves Alice's queue, and Carol loses it, clearing Lava Spike.
    await pick(id, ids['Lightning Bolt']).expect(200);

    await undo(id, 1).expect(200);

    expect((await queue(id).expect(200)).body.cards).toEqual([shock, bolt]);
    expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
      bolt,
      spike,
    ]);
    expect((await queue(id, bobCookie).expect(200)).body.cards).toEqual([
      skewer,
    ]);
  });

  describe('of a pick that cleared a queue', () => {
    let carolCookie: string;

    /** Carol, picking last, has Shock, Bolt and Lava Spike queued, and Alice picks Bolt. */
    async function clearedByPickOne() {
      carolCookie = await signIn(carol);
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        fourCards,
      );
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], carolCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);
      return id;
    }

    it('restores the whole queue in its original order, and makes no queued picks', async () => {
      const id = await clearedByPickOne();
      const ids = await poolCardIds(id);
      // Alice's turn comes back with a card queued, which must wait for her.
      await enqueue(id, ids['Skewer the Critics']).expect(200);

      const undone = await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
        queuePaused: false,
      });
      expect(undone.body.turn.playerId).toBe(alice.id);
      expect(await pickLogLines(id)).toEqual([]);
    });

    it('puts cards queued since after the restored ones, with no duplicates', async () => {
      const id = await clearedByPickOne();
      const ids = await poolCardIds(id);
      await enqueue(id, ids['Skewer the Critics'], carolCookie).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
        shock,
        bolt,
        spike,
        skewer,
      ]);
    });

    it('restores the queue even if the notice was dismissed', async () => {
      const id = await clearedByPickOne();
      await dismissNotice(id, carolCookie).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
        shock,
        bolt,
        spike,
      ]);
    });

    it('restores a long queue in its original order after one of its cards was queued again and the notice dismissed', async () => {
      carolCookie = await signIn(carol);
      // Guards the taken-out cards' `orderBy: { position: 'asc' }` in
      // queue-clearing.ts. Without it they come back in storage order, which
      // only changes once their rows fill a storage page, so that queuing one
      // again moves its row after the others: hence 60 cards. A schema or
      // PGlite change could quietly stop this killing that mutant; a later
      // Stryker run would show it.
      const cards = Array.from(
        { length: 60 },
        (_, i) => `Card ${String(i).padStart(2, '0')}`,
      );
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        cards,
      );
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      for (const name of cards) {
        await enqueue(id, ids[name], carolCookie).expect(200);
      }
      await pick(id, ids['Card 59']).expect(200);
      await enqueue(id, ids['Card 00'], carolCookie).expect(200);
      await dismissNotice(id, carolCookie).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual(
        cards.map((name) => ({ poolCardId: ids[name], name })),
      );
    });

    it('restores only what that pick cleared, and drops only that from the notice', async () => {
      carolCookie = await signIn(carol);
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        fourCards,
      );
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], carolCookie).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);
      await enqueue(id, ids['Skewer the Critics'], carolCookie).expect(200);
      await pick(id, ids['Lava Spike'], bobCookie).expect(200);

      await undo(id, 2).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [spike, skewer],
        lost: [bolt],
        cleared: [shock],
        restKept: false,
        stealBehavior: 'ClearQueue',
        queuePaused: false,
      });

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike, skewer],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
        queuePaused: false,
      });
    });
  });

  describe('in a pool with copies of a card', () => {
    it('keeps a queue entry its pick moved on its new copy, in the same place', async () => {
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies([
        aliceCookie,
        bobCookie,
        carolCookie,
      ]);
      await start(id).expect(200);
      await enqueue(id, first, carolCookie).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await pick(id, first).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [
          { poolCardId: second, name: 'Lightning Bolt' },
          { poolCardId: ids.Shock, name: 'Shock' },
        ],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
        queuePaused: false,
      });
      // The picked copy is back in the pool.
      await pick(id, first).expect(200);
    });

    it('puts a lost card back where it sat after an earlier pick made its queue hold another copy', async () => {
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies(
        [aliceCookie, bobCookie, carolCookie],
        2,
        ['Skewer the Critics', 'Fireblast'],
      );
      // Carol picks first, so Bob picks twice in a row after Alice.
      await setSeats(id, [carol.id, alice.id, bob.id]).expect(200);
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await pick(id, ids.Fireblast, carolCookie).expect(200);
      await enqueue(id, first, carolCookie).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);
      // Carol's queue holds the second copy in the first's place.
      await pick(id, first).expect(200);
      await pick(id, ids.Shock, bobCookie).expect(200);

      await undo(id, 3).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [{ poolCardId: second, name: 'Lightning Bolt' }, shock, spike],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'PickNext',
        queuePaused: false,
      });
    });

    it('restores a queue its pick lost a copy from, every copy in its place', async () => {
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies([
        aliceCookie,
        bobCookie,
        carolCookie,
      ]);
      await start(id).expect(200);
      await enqueue(id, first, carolCookie).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, second, carolCookie).expect(200);
      await pick(id, first).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [
          { poolCardId: first, name: 'Lightning Bolt' },
          { poolCardId: ids.Shock, name: 'Shock' },
          { poolCardId: second, name: 'Lightning Bolt' },
        ],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
        queuePaused: false,
      });
    });
  });

  it('answers an undo sent twice at once with one 200 and one refusal, as it refuses to undo any pick but the latest', async () => {
    // On PGlite the two run one after the other; undo.race.spec.ts races
    // them on a real Postgres.
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    const [first, second] = await Promise.all([undo(id, 2), undo(id, 2)]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const refused = await undo(id, 2).expect(409);
    expect(refused.body.error).toBe('not-latest');
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
  });

  it('refuses an undo with no picks to undo', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);

    const refused = await undo(id, 1).expect(409);

    expect(refused.body).toEqual({
      error: 'not-latest',
      message:
        'Only the latest pick can be undone, and the picks have changed.',
    });
  });

  it('undoes its own draft’s latest pick, while another draft holds later picks', async () => {
    const other = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(other).expect(200);
    const otherIds = await poolCardIds(other);
    await pick(other, otherIds.Shock).expect(200);
    // A second pick, so the other draft's latest is numbered after this one's.
    await pick(other, otherIds['Lightning Bolt'], bobCookie).expect(200);
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);
    const ids = await poolCardIds(id);
    await pick(id, ids.Shock).expect(200);

    const undone = await undo(id, 1).expect(200);

    expect(undone.body.turn).toEqual({ pick: 1, round: 1, playerId: alice.id });
    expect(await pickLogLines(id)).toEqual([]);
    expect(await pickLogLines(other)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
    ]);
  });

  it('refuses an undo before the draft starts, or once it is complete', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    expect((await undo(id, 1).expect(409)).body).toEqual({
      error: 'not-drafting',
      message:
        'Picks can only be undone while the draft is drafting or frozen.',
    });
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    const refused = await undo(id, 2).expect(409);

    expect(refused.body.error).toBe('not-drafting');
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
    ]);
  });

  it('undoes a pick while the draft is frozen, leaving it frozen', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await post(id, 'freeze').expect(200);

    const undone = await undo(id, 1).expect(200);

    expect(undone.body).toMatchObject({
      state: 'Frozen',
      turn: { pick: 1, playerId: alice.id },
    });
    expect(await pickLogLines(id)).toEqual([]);
  });

  it('announces the undo, pinging the player whose turn it is again', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      await registerWebhook(),
    );
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    await undo(id, 2).expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages[3]).toEqual({
      content:
        'Undone: 2- **Bob** picked **Lightning Bolt**\n' +
        `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
      allowed_mentions: { parse: [], users: [bob.id] },
    });
  });

  it('lets an app admin undo, but not other players', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    await undo(id, 2, bobCookie).expect(403);
    await undo(id, 2, await signIn(carol)).expect(200);
  });

  it('is a 400 for a pick that is not a number, and 404 for a draft that does not exist', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);

    await undo(id, 'latest').expect(400);
    await undo('no-such-draft', 1).expect(404);
  });
});
