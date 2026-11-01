import request from 'supertest';
import {
  alice,
  bob,
  carol,
  app,
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
} from './harness.js';

useDraftsApp();

describe('undo', () => {
  const cards = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the latest pick, returning its card to the pool and the turn to its player', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

    const undone = await undo(id, 2).expect(200);

    expect(undone.body.turn).toEqual({
      pick: 2,
      round: 1,
      playerId: bob.id,
    });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    // Lightning Bolt is back in the pool.
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
    ]);
  });

  it('undoes only the last pick of a cascade, and makes no queued picks', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
    await enqueue(id, 'skewer-the-critics-oracle', bobCookie).expect(200);
    await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);

    const undone = await undo(id, 3).expect(200);

    // Bob's queue still has Lightning Bolt, but it waits for him.
    expect(undone.body.turn).toEqual({ pick: 3, round: 2, playerId: bob.id });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
  });

  it('returns the card to the queues it was lost from, to be picked on the next real pick', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await enqueue(id, 'skewer-the-critics-oracle').expect(200);
    await pick(id, 'skewer-the-critics-oracle', bobCookie).expect(200);

    await undo(id, 2).expect(200);

    expect((await queue(id).expect(200)).body).toEqual({
      cards: [
        { oracleId: 'skewer-the-critics-oracle', name: 'Skewer the Critics' },
      ],
      lost: [],
      cleared: [],
    });
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
    await pick(id, 'lava-spike-oracle', bobCookie).expect(200);
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
      'Bob: Lava Spike',
      'Alice: Skewer the Critics',
    ]);
  });

  describe('of a pick that cleared a queue', () => {
    const shock = { oracleId: 'shock-oracle', name: 'Shock' };
    const bolt = { oracleId: 'lightning-bolt-oracle', name: 'Lightning Bolt' };
    const spike = { oracleId: 'lava-spike-oracle', name: 'Lava Spike' };
    const skewer = {
      oracleId: 'skewer-the-critics-oracle',
      name: 'Skewer the Critics',
    };
    let carolCookie: string;

    /** Carol, picking last, has Shock, Bolt and Lava Spike queued, and Alice picks Bolt. */
    async function clearedByPickOne() {
      carolCookie = await signIn(carol);
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        cards,
      );
      await enqueue(id, 'shock-oracle', carolCookie).expect(200);
      await enqueue(id, 'lightning-bolt-oracle', carolCookie).expect(200);
      await enqueue(id, 'lava-spike-oracle', carolCookie).expect(200);
      await start(id).expect(200);
      await pick(id, 'lightning-bolt-oracle').expect(200);
      return id;
    }

    it('restores the whole queue in its original order, and makes no queued picks', async () => {
      const id = await clearedByPickOne();

      const undone = await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike],
        lost: [],
        cleared: [],
      });
      expect(undone.body.turn.playerId).toBe(alice.id);
      expect(await pickLogLines(id)).toEqual([]);
    });

    it('puts cards queued since after the restored ones, with no duplicates', async () => {
      const id = await clearedByPickOne();
      await enqueue(id, 'skewer-the-critics-oracle', carolCookie).expect(200);
      await enqueue(id, 'shock-oracle', carolCookie).expect(200);

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
      await request(app.getHttpServer())
        .delete(`/api/drafts/${id}/queue/lost`)
        .set('Cookie', carolCookie)
        .expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
        shock,
        bolt,
        spike,
      ]);
    });

    it('restores only what that pick cleared, and drops only that from the notice', async () => {
      carolCookie = await signIn(carol);
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        cards,
      );
      await enqueue(id, 'shock-oracle', carolCookie).expect(200);
      await enqueue(id, 'lightning-bolt-oracle', carolCookie).expect(200);
      await start(id).expect(200);
      await pick(id, 'lightning-bolt-oracle').expect(200);
      await enqueue(id, 'lava-spike-oracle', carolCookie).expect(200);
      await enqueue(id, 'skewer-the-critics-oracle', carolCookie).expect(200);
      await pick(id, 'lava-spike-oracle', bobCookie).expect(200);

      await undo(id, 2).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [spike, skewer],
        lost: [bolt],
        cleared: [shock],
      });

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike, skewer],
        lost: [],
        cleared: [],
      });
    });
  });

  it('refuses to undo any pick but the latest, so an undo sent twice takes back one', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

    const [first, second] = await Promise.all([undo(id, 2), undo(id, 2)]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const refused = await undo(id, 2).expect(409);
    expect(refused.body.error).toBe('not-latest');
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
  });

  it('refuses an undo with no picks to undo', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);

    const refused = await undo(id, 1).expect(409);

    expect(refused.body.error).toBe('not-latest');
  });

  it('refuses an undo before the draft starts, or once it is complete', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    expect((await undo(id, 1).expect(409)).body.error).toBe('not-drafting');
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

    const refused = await undo(id, 2).expect(409);

    expect(refused.body.error).toBe('not-drafting');
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
    ]);
  });

  it('undoes a pick while the draft is paused, leaving it paused', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/pause`)
      .set('Cookie', aliceCookie)
      .expect(200);

    const undone = await undo(id, 1).expect(200);

    expect(undone.body).toMatchObject({
      state: 'Paused',
      turn: { pick: 1, playerId: alice.id },
    });
    expect(await pickLogLines(id)).toEqual([]);
  });

  it('announces the undo, pinging the player whose turn it is again', async () => {
    const webhook = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .set('Cookie', await signIn(carol))
      .send({
        name: '#roto-main',
        url: 'https://discord.com/api/webhooks/1234567890/secret-token',
      })
      .expect(201);
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      cards,
      webhook.body.id,
    );
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

    await undo(id, 2).expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages[3]).toEqual({
      content:
        'Pick 2 (**Lightning Bolt** by **Bob**) was undone\n' +
        `<@${bob.id}> you’re up\n` +
        `<https://roto.example/drafts/${id}>`,
      allowed_mentions: { parse: [], users: [bob.id] },
    });
  });

  it('lets an app admin undo, but not other players', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

    await undo(id, 2, bobCookie).expect(403);
    await undo(id, 2, await signIn(carol)).expect(200);
  });

  it('is a 400 for a pick that is not a number, and 404 for a draft that does not exist', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);

    await undo(id, 'latest').expect(400);
    await undo('no-such-draft', 1).expect(404);
  });
});
