import request from 'supertest';
import type { DraftView } from '../draft-view.js';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  useDraftsApp,
  signIn,
  getDraft,
  undoPick,
  readyDraft,
  start,
} from './harness.js';

useDraftsApp();

describe('queue', () => {
  function queue(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .get(`/api/drafts/${id}/queue`)
      .set('Cookie', cookie);
  }

  function enqueue(id: string, oracleId: unknown, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/queue`)
      .set('Cookie', cookie)
      .send({ oracleId });
  }

  const shock = { oracleId: 'shock-oracle', name: 'Shock' };
  const bolt = { oracleId: 'lightning-bolt-oracle', name: 'Lightning Bolt' };
  const spike = { oracleId: 'lava-spike-oracle', name: 'Lava Spike' };

  it('lets a player add cards to the end of their queue', async () => {
    const id = await readyDraft([aliceCookie]);

    await enqueue(id, 'lava-spike-oracle').expect(200);
    const added = await enqueue(id, 'shock-oracle').expect(200);

    expect(added.body).toEqual({ cards: [spike, shock], lost: [] });
    expect((await queue(id).expect(200)).body).toEqual({
      cards: [spike, shock],
      lost: [],
    });
  });

  it('keeps each queue private to its player', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await enqueue(id, 'shock-oracle').expect(200);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);

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
    await enqueue(id, 'shock-oracle', carolCookie).expect(403);
    // Not in the draft as anyone sees it, either.
    const draft = JSON.stringify((await getDraft(id).expect(200)).body);
    expect(draft).not.toContain('shock-oracle');
  });

  it('adds a card already queued only once', async () => {
    const id = await readyDraft([aliceCookie]);
    await enqueue(id, 'shock-oracle').expect(200);
    await enqueue(id, 'lava-spike-oracle').expect(200);

    const again = await enqueue(id, 'shock-oracle').expect(200);

    expect(again.body.cards).toEqual([shock, spike]);
  });

  it('refuses a card not in the pool, or already picked', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);

    expect((await enqueue(id, 'shock-oracle').expect(409)).body).toEqual({
      error: 'already-picked',
      message: 'That card has already been picked.',
    });
    expect(
      (await enqueue(id, 'shivan-dragon-oracle').expect(404)).body,
    ).toEqual({
      error: 'not-in-pool',
      message: 'That card isn’t in this pool.',
    });
    await enqueue(id, '').expect(400);
    await enqueue(id, 42).expect(400);
  });

  function reorder(id: string, oracleIds: unknown, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .put(`/api/drafts/${id}/queue`)
      .set('Cookie', cookie)
      .send({ oracleIds });
  }

  it('lets a player reorder their queue', async () => {
    const id = await readyDraft([aliceCookie]);
    for (const card of [shock, bolt, spike]) {
      await enqueue(id, card.oracleId).expect(200);
    }

    const reordered = await reorder(id, [
      'lava-spike-oracle',
      'shock-oracle',
      'lightning-bolt-oracle',
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
    await enqueue(id, 'shock-oracle').expect(200);
    await enqueue(id, 'lava-spike-oracle').expect(200);

    const refused = await reorder(id, ['shock-oracle']).expect(409);

    expect(refused.body).toEqual({
      error: 'queue-changed',
      message: 'Your queue has changed. Reload and try again.',
    });
    await reorder(id, ['shock-oracle', 'lightning-bolt-oracle']).expect(409);
    await reorder(id, ['shock-oracle', 'shock-oracle']).expect(400);
    await reorder(id, 'shock-oracle').expect(400);
    expect((await queue(id).expect(200)).body.cards).toEqual([shock, spike]);
  });

  function remove(id: string, oracleId: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .delete(`/api/drafts/${id}/queue/${oracleId}`)
      .set('Cookie', cookie);
  }

  it('lets a player remove a card from their queue', async () => {
    const id = await readyDraft([aliceCookie]);
    for (const card of [shock, bolt, spike]) {
      await enqueue(id, card.oracleId).expect(200);
    }

    const removed = await remove(id, 'lightning-bolt-oracle').expect(200);

    expect(removed.body.cards).toEqual([shock, spike]);
    // Removing it twice changes nothing.
    await remove(id, 'lightning-bolt-oracle').expect(200);
    expect((await queue(id).expect(200)).body.cards).toEqual([shock, spike]);
    await remove(id, 'shock-oracle', await signIn(carol)).expect(403);
  });

  describe('when cards are picked', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function pick(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie)
        .send({ oracleId });
    }

    it('takes a card another player picks out of the queue, as lost', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 1, [
        'Shock',
        'Lightning Bolt',
        'Lava Spike',
        'Skewer the Critics',
      ]);
      await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
      await enqueue(id, 'shock-oracle', bobCookie).expect(200);
      await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      await start(id).expect(200);

      // Bob's turn then picks Shock from his queue.
      await pick(id, 'lava-spike-oracle').expect(200);

      // Bob's own pick just leaves his queue; Alice's is lost to him.
      expect((await queue(id, bobCookie).expect(200)).body).toEqual({
        cards: [bolt],
        lost: [spike],
      });
    });

    it('lets a player dismiss their lost cards', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await enqueue(id, 'shock-oracle', bobCookie).expect(200);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      expect((await queue(id, bobCookie).expect(200)).body.lost).toEqual([
        shock,
      ]);

      const dismissed = await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/queue/lost`)
        .set('Cookie', bobCookie)
        .expect(200);

      expect(dismissed.body).toEqual({ cards: [], lost: [] });
    });

    it('marks a card lost to a bot, too', async () => {
      const id = await readyDraft([aliceCookie], 1, ['Shock', 'Lava Spike']);
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/bots`)
        .set('Cookie', await signIn(carol))
        .expect(201);
      await enqueue(id, 'shock-oracle').expect(200);
      // The bot picks first: the last card by name, Shock.
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      await request(app.getHttpServer())
        .put(`/api/drafts/${id}/seats`)
        .set('Cookie', aliceCookie)
        .send({ userIds: draft.players.map((p) => p.id).reverse() })
        .expect(200);
      await start(id).expect(200);

      await vi.waitFor(async () => {
        expect((await queue(id).expect(200)).body).toEqual({
          cards: [],
          lost: [shock],
        });
      });
    });

    it('refuses a card once the draft is complete', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

      const refused = await enqueue(id, 'lava-spike-oracle').expect(409);

      expect(refused.body).toEqual({
        error: 'draft-complete',
        message: 'This draft is complete.',
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

    function pick(id: string, oracleId: string, cookie = aliceCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/picks`)
        .set('Cookie', cookie)
        .send({ oracleId });
    }

    function post(id: string, action: string) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/${action}`)
        .set('Cookie', aliceCookie);
    }

    it('refuses an add from the player whose turn it is while drafting, but not from the others', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);

      expect((await enqueue(id, 'shock-oracle').expect(409)).body).toEqual(
        refusedOnTurn,
      );

      await enqueue(id, 'shock-oracle', bobCookie).expect(200);
      expect((await queue(id).expect(200)).body.cards).toEqual([]);
      expect((await queue(id, bobCookie).expect(200)).body.cards).toEqual([
        shock,
      ]);
    });

    it('refuses an add from the player whose turn it is while paused, but not from the others', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await post(id, 'pause').expect(200);

      expect((await enqueue(id, 'shock-oracle').expect(409)).body).toEqual(
        refusedOnTurn,
      );

      await enqueue(id, 'shock-oracle', bobCookie).expect(200);
    });

    it('allows an add again once the turn has passed', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);

      await enqueue(id, 'lava-spike-oracle').expect(200);
      expect(
        (await enqueue(id, 'lava-spike-oracle', bobCookie).expect(409)).body,
      ).toEqual(refusedOnTurn);
    });

    it('refuses the player on turn when the draft is closed or complete for that reason, not the turn', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);
      await post(id, 'close').expect(200);

      expect((await enqueue(id, 'shock-oracle').expect(409)).body.error).toBe(
        'draft-closed',
      );

      await post(id, 'reopen').expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      expect(
        (await enqueue(id, 'lava-spike-oracle').expect(409)).body.error,
      ).toBe('draft-complete');
    });

    it('still lets the player on turn reorder and remove', async () => {
      const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
      for (const card of [shock, bolt, spike]) {
        await enqueue(id, card.oracleId).expect(200);
      }
      await start(id).expect(200);
      // Alice's turn came, so Shock was picked for her. Undoing it brings
      // her turn back with the rest of her queue still waiting.
      await undoPick(id, 1);

      const reordered = await reorder(id, [
        'lava-spike-oracle',
        'lightning-bolt-oracle',
      ]).expect(200);
      expect(reordered.body.cards).toEqual([spike, bolt]);

      const removed = await remove(id, 'lava-spike-oracle').expect(200);
      expect(removed.body.cards).toEqual([bolt]);
    });

    it('keeps a queued card after an undo, without picking it, and lets it be removed', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await enqueue(id, 'shock-oracle').expect(200);
      await enqueue(id, 'lava-spike-oracle').expect(200);
      await start(id).expect(200);

      const undone = await undoPick(id, 1);

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

      const removed = await remove(id, 'lava-spike-oracle').expect(200);
      expect(removed.body.cards).toEqual([]);
    });

    it('makes a player on the first of two turns in a row make the second by hand', async () => {
      const bobCookie = await signIn(bob);
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);

      expect(
        (await enqueue(id, 'skewer-the-critics-oracle', bobCookie).expect(409))
          .body,
      ).toEqual(refusedOnTurn);

      const first = await pick(id, 'lightning-bolt-oracle', bobCookie).expect(
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
    await enqueue('no-such-draft', 'shock-oracle').expect(404);
  });
});
