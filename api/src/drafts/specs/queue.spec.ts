import type { DraftView } from 'contract';
import request from 'supertest';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  start,
  queue,
  enqueue,
  pick,
  post,
  undo,
  dismissNotice,
  poolCardIds,
  readyDraftWithCopies,
  waitForBotPicks,
} from './harness.js';

useDraftsApp();

describe('queue', () => {
  /** A queued card, named by any pool card id: each test's draft has its own. */
  const queued = (name: string) => ({ poolCardId: expect.any(String), name });
  const shock = queued('Shock');
  const bolt = queued('Lightning Bolt');
  const spike = queued('Lava Spike');
  const skewer = queued('Skewer the Critics');

  it('lets a player add cards to the end of their queue', async () => {
    const id = await readyDraft([aliceCookie]);
    const ids = await poolCardIds(id);

    await enqueue(id, ids['Lava Spike']).expect(200);
    const added = await enqueue(id, ids.Shock).expect(200);

    expect(added.body).toEqual({
      cards: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike' },
        { poolCardId: ids.Shock, name: 'Shock' },
      ],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
    expect((await queue(id).expect(200)).body).toEqual({
      cards: [spike, shock],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
  });

  it('keeps each queue private to its player', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    const ids = await poolCardIds(id);
    await enqueue(id, ids.Shock).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);

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
    await enqueue(id, ids.Shock, carolCookie).expect(403);
    // Not in the draft as anyone sees it, either.
    const draft = JSON.stringify((await getDraft(id).expect(200)).body);
    expect(draft).not.toContain(ids.Shock);
  });

  it('adds a card already queued only once', async () => {
    const id = await readyDraft([aliceCookie]);
    const ids = await poolCardIds(id);
    await enqueue(id, ids.Shock).expect(200);
    await enqueue(id, ids['Lava Spike']).expect(200);

    const again = await enqueue(id, ids.Shock).expect(200);

    expect(again.body.cards).toEqual([shock, spike]);
  });

  it('refuses a card not in the pool, or already picked', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ poolCardId: ids.Shock })
      .expect(200);

    expect((await enqueue(id, ids.Shock).expect(409)).body).toEqual({
      error: 'already-picked',
      message: 'That card has already been picked.',
    });
    expect((await enqueue(id, 'no-such-card').expect(404)).body).toEqual({
      error: 'not-in-pool',
      message: 'That card isn’t in this pool.',
    });
    await enqueue(id, '').expect(400);
    await enqueue(id, 42).expect(400);
  });

  function reorder(id: string, poolCardIds: unknown, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .put(`/api/drafts/${id}/queue`)
      .set('Cookie', cookie)
      .send({ poolCardIds });
  }

  it('lets a player reorder their queue', async () => {
    const id = await readyDraft([aliceCookie]);
    const ids = await poolCardIds(id);
    for (const card of [shock, bolt, spike]) {
      await enqueue(id, ids[card.name]).expect(200);
    }

    const reordered = await reorder(id, [
      ids['Lava Spike'],
      ids.Shock,
      ids['Lightning Bolt'],
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
    const ids = await poolCardIds(id);
    await enqueue(id, ids.Shock).expect(200);
    await enqueue(id, ids['Lava Spike']).expect(200);

    const refused = await reorder(id, [ids.Shock]).expect(409);

    expect(refused.body).toEqual({
      error: 'queue-changed',
      message: 'Your queue has changed. Reload and try again.',
    });
    await reorder(id, [ids.Shock, ids['Lightning Bolt']]).expect(409);
    await reorder(id, [ids.Shock, ids.Shock]).expect(400);
    await reorder(id, ids.Shock).expect(400);
    expect((await queue(id).expect(200)).body.cards).toEqual([shock, spike]);
  });

  function remove(id: string, poolCardId: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .delete(`/api/drafts/${id}/queue/${poolCardId}`)
      .set('Cookie', cookie);
  }

  it('lets a player remove a card from their queue', async () => {
    const id = await readyDraft([aliceCookie]);
    const ids = await poolCardIds(id);
    for (const card of [shock, bolt, spike]) {
      await enqueue(id, ids[card.name]).expect(200);
    }

    const removed = await remove(id, ids['Lightning Bolt']).expect(200);

    expect(removed.body.cards).toEqual([shock, spike]);
    // Removing it twice changes nothing.
    await remove(id, ids['Lightning Bolt']).expect(200);
    expect((await queue(id).expect(200)).body.cards).toEqual([shock, spike]);
    await remove(id, ids.Shock, await signIn(carol)).expect(403);
  });

  describe('when cards are picked', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('marks a card another player picks as lost and clears the rest of the queue', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 1, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      const ids = await poolCardIds(id);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await enqueue(id, ids.Shock, bobCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await start(id).expect(200);

      await pick(id, ids.Shock).expect(200);

      expect((await queue(id, bobCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [shock],
        cleared: [spike, bolt],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
      // The cards are still available, and it's for Bob to pick by hand.
      await pick(id, ids['Lava Spike'], bobCookie).expect(200);
    });

    it('leaves the rest of a queue in place after the player’s own pick', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lava Spike']).expect(200);
      await start(id).expect(200);

      // Queued by Alice, Shock is picked for her when the draft starts.
      expect((await queue(id).expect(200)).body).toEqual({
        cards: [spike],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });

    it('builds up the lost and cleared cards across clearings, for that player alone', async () => {
      const bobCookie = await signIn(bob);
      const carolCookie = await signIn(carol);
      const id = await readyDraft([aliceCookie, bobCookie, carolCookie], 1, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], carolCookie).expect(200);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);
      await enqueue(id, ids['Skewer the Critics'], carolCookie).expect(200);

      await pick(id, ids['Lava Spike'], bobCookie).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [bolt, spike],
        cleared: [shock, skewer],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
      expect((await queue(id).expect(200)).body).toEqual({
        cards: [],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
      const draft = JSON.stringify((await getDraft(id).expect(200)).body);
      expect(draft).not.toContain(ids['Skewer the Critics']);
    });

    it('takes a cleared card off the list once it is queued again, and for good', async () => {
      const bobCookie = await signIn(bob);
      const carolCookie = await signIn(carol);
      const id = await readyDraft([aliceCookie, bobCookie, carolCookie], 1, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], carolCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);

      const queuedAgain = await enqueue(id, ids.Shock, carolCookie);

      expect(queuedAgain.body).toEqual({
        cards: [shock],
        lost: [bolt],
        cleared: [spike],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
      const removed = await remove(id, ids.Shock, carolCookie).expect(200);
      expect(removed.body.cleared).toEqual([spike]);
    });

    it('refuses to queue a cleared card on the player’s own turn', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock, bobCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);

      const refused = await enqueue(id, ids['Lava Spike'], bobCookie);

      expect(refused.status).toBe(409);
      expect(refused.body.error).toBe('your-turn');
    });

    it('keeps listing a cleared card someone later picks as cleared, not lost', async () => {
      const bobCookie = await signIn(bob);
      const carolCookie = await signIn(carol);
      const id = await readyDraft([aliceCookie, bobCookie, carolCookie], 1, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], carolCookie).expect(200);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);

      await pick(id, ids.Shock, bobCookie).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [bolt],
        cleared: [shock],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });

    it('lets a player dismiss their lost and cleared cards', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock, bobCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);
      expect((await queue(id, bobCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [shock],
        cleared: [spike],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });

      const dismissed = await dismissNotice(id, bobCookie).expect(200);

      expect(dismissed.body).toEqual({
        cards: [],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });

    it('clears a queue for a bot’s pick, too', async () => {
      const id = await readyDraft([aliceCookie], 1, ['Shock', 'Lava Spike']);
      const ids = await poolCardIds(id);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/bots`)
        .set('Cookie', await signIn(carol))
        .expect(201);
      await enqueue(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lava Spike']).expect(200);
      // The bot picks first: the last card by name, Shock.
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      await request(app.getHttpServer())
        .put(`/api/drafts/${id}/seats`)
        .set('Cookie', aliceCookie)
        .send({ userIds: draft.players.map((p) => p.id).reverse() })
        .expect(200);
      await start(id).expect(200);

      await waitForBotPicks(1, async () => {
        expect((await queue(id).expect(200)).body).toEqual({
          cards: [],
          lost: [shock],
          cleared: [spike],
          restKept: false,
          stealBehavior: 'ClearQueue',
        });
      });
    });

    it('refuses a card once the draft is complete', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

      const refused = await enqueue(id, ids['Lava Spike']).expect(409);

      expect(refused.body).toEqual({
        error: 'draft-complete',
        message: 'This draft is complete.',
      });
    });
  });

  describe('when the pool holds copies of a card', () => {
    it('moves a queued copy another player picks to a copy still available, in the same place', async () => {
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies([
        aliceCookie,
        await signIn(bob),
        carolCookie,
      ]);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, first, carolCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);
      await start(id).expect(200);

      await pick(id, first).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [
          { poolCardId: ids.Shock, name: 'Shock' },
          { poolCardId: second, name: 'Lightning Bolt' },
          { poolCardId: ids['Lava Spike'], name: 'Lava Spike' },
        ],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });

    it('takes a copy a queued card moves to off the cleared list', async () => {
      const bobCookie = await signIn(bob);
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies(
        [aliceCookie, bobCookie, carolCookie],
        2,
        ['Skewer the Critics', 'Fireblast'],
      );
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await enqueue(id, second, carolCookie).expect(200);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lava Spike'], bobCookie).expect(200);
      await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
      await pick(id, ids.Fireblast, carolCookie).expect(200);
      await enqueue(id, first, carolCookie).expect(200);

      await pick(id, first, bobCookie).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [{ poolCardId: second, name: 'Lightning Bolt' }],
        lost: [shock],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });

    it('lets a player queue several copies of a card, each its own entry', async () => {
      const { id, first, second } = await readyDraftWithCopies([aliceCookie]);

      await enqueue(id, second).expect(200);
      const added = await enqueue(id, first).expect(200);

      expect(added.body.cards).toEqual([
        { poolCardId: second, name: 'Lightning Bolt' },
        { poolCardId: first, name: 'Lightning Bolt' },
      ]);
    });

    it('loses a queued copy when no copy is left that the queue doesn’t already hold', async () => {
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies([
        aliceCookie,
        await signIn(bob),
        carolCookie,
      ]);
      await enqueue(id, first, carolCookie).expect(200);
      await enqueue(id, second, carolCookie).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await start(id).expect(200);

      await pick(id, first).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [{ poolCardId: first, name: 'Lightning Bolt' }],
        cleared: [
          { poolCardId: second, name: 'Lightning Bolt' },
          { poolCardId: ids.Shock, name: 'Shock' },
        ],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });

    it('loses a queued copy once every other copy is picked', async () => {
      const bobCookie = await signIn(bob);
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies([
        aliceCookie,
        bobCookie,
        carolCookie,
      ]);
      await enqueue(id, first, carolCookie).expect(200);
      await enqueue(id, ids.Shock, carolCookie).expect(200);
      await start(id).expect(200);
      await pick(id, second).expect(200);

      await pick(id, first, bobCookie).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [{ poolCardId: first, name: 'Lightning Bolt' }],
        cleared: [{ poolCardId: ids.Shock, name: 'Shock' }],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });
  });

  describe('on a player’s own turn', () => {
    const cards = [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ];
    const refusedOnTurn = {
      error: 'your-turn',
      message: 'You can’t add to your queue on your turn.',
    };

    it('refuses an add from the player whose turn it is while drafting, but not from the others', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      const ids = await poolCardIds(id);
      await start(id).expect(200);

      expect((await enqueue(id, ids.Shock).expect(409)).body).toEqual(
        refusedOnTurn,
      );

      await enqueue(id, ids.Shock, bobCookie).expect(200);
      expect((await queue(id).expect(200)).body.cards).toEqual([]);
      expect((await queue(id, bobCookie).expect(200)).body.cards).toEqual([
        shock,
      ]);
    });

    it('refuses an add from the player whose turn it is while paused, but not from the others', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await post(id, 'pause').expect(200);

      expect((await enqueue(id, ids.Shock).expect(409)).body).toEqual(
        refusedOnTurn,
      );

      await enqueue(id, ids.Shock, bobCookie).expect(200);
    });

    it('allows an add again once the turn has passed', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);

      await enqueue(id, ids['Lava Spike']).expect(200);
      expect(
        (await enqueue(id, ids['Lava Spike'], bobCookie).expect(409)).body,
      ).toEqual(refusedOnTurn);
    });

    it('refuses the player on turn when the draft is closed or complete for that reason, not the turn', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await post(id, 'close').expect(200);

      expect((await enqueue(id, ids.Shock).expect(409)).body.error).toBe(
        'draft-closed',
      );

      await post(id, 'reopen').expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
      expect(
        (await enqueue(id, ids['Lava Spike']).expect(409)).body.error,
      ).toBe('draft-complete');
    });

    it('still lets the player on turn reorder and remove', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
      const ids = await poolCardIds(id);
      for (const card of [shock, bolt, spike]) {
        await enqueue(id, ids[card.name]).expect(200);
      }
      await start(id).expect(200);
      // Alice's turn came, so Shock was picked for her. Undoing it brings
      // her turn back with the rest of her queue still waiting.
      await undo(id, 1).expect(200);

      const reordered = await reorder(id, [
        ids['Lava Spike'],
        ids['Lightning Bolt'],
      ]).expect(200);
      expect(reordered.body.cards).toEqual([spike, bolt]);

      const removed = await remove(id, ids['Lava Spike']).expect(200);
      expect(removed.body.cards).toEqual([bolt]);
    });

    it('keeps a queued card after an undo, without picking it, and lets it be removed', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lava Spike']).expect(200);
      await start(id).expect(200);

      const undone = await undo(id, 1).expect(200);

      expect(undone.body.turn).toEqual({
        pick: 1,
        round: 1,
        playerId: alice.id,
      });
      expect((await queue(id).expect(200)).body.cards).toEqual([spike]);
      const log = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/picks`)
        .set('Cookie', aliceCookie)
        .expect(200);
      expect(log.body).toEqual([]);

      const removed = await remove(id, ids['Lava Spike']).expect(200);
      expect(removed.body.cards).toEqual([]);
    });

    it('makes a player on the first of two turns in a row make the second by hand', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);

      expect(
        (await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(409))
          .body,
      ).toEqual(refusedOnTurn);

      const first = await pick(id, ids['Lightning Bolt'], bobCookie).expect(
        200,
      );
      expect(first.body.turn).toEqual({
        pick: 3,
        round: 2,
        playerId: bob.id,
      });
    });
  });

  it('is 404 for a draft that does not exist', async () => {
    await queue('no-such-draft').expect(404);
    await enqueue('no-such-draft', 'no-such-card').expect(404);
  });
});
