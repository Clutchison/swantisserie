import request from 'supertest';
import {
  bob,
  carol,
  app,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  post,
  pick,
  enqueue,
  queue,
  pickLog,
  undo,
} from './harness.js';

useDraftsApp();

describe('close and reopen', () => {
  const cards = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  function close(id: string, cookie = aliceCookie) {
    return post(id, 'close', cookie);
  }

  function reopen(id: string, cookie = aliceCookie) {
    return post(id, 'reopen', cookie);
  }

  it('closes a drafting draft with no picks, showing no turn', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);

    const closed = await close(id).expect(200);

    expect(closed.body).toMatchObject({ state: 'Closed', turn: null });
  });

  it('closes a paused draft', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await post(id, 'pause').expect(200);

    expect((await close(id).expect(200)).body.state).toBe('Closed');
  });

  it('keeps every pick as made, even mid-round', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);

    await close(id).expect(200);

    expect(
      (await pickLog(id)).body.map((p: { name: string }) => p.name),
    ).toEqual(['Shock']);
  });

  it('refuses to close a draft in the lobby, complete or already closed', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    expect((await close(id).expect(409)).body.error).toBe('not-closable');

    await start(id).expect(200);
    await close(id).expect(200);
    expect((await close(id).expect(409)).body.error).toBe('not-closable');

    await reopen(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
    expect((await close(id).expect(409)).body.error).toBe('not-closable');
  });

  it('refuses to reopen a draft that is not closed, so never a complete one', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    expect((await reopen(id).expect(409)).body.error).toBe('not-closed');

    await start(id).expect(200);
    expect((await reopen(id).expect(409)).body.error).toBe('not-closed');

    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
    expect((await reopen(id).expect(409)).body.error).toBe('not-closed');
  });

  it('lets an app admin close and reopen, but not other players', async () => {
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);

    await close(id, bobCookie).expect(403);
    await close(id, carolCookie).expect(200);
    await reopen(id, bobCookie).expect(403);
    await reopen(id, carolCookie).expect(200);
  });

  it('refuses picks and undo while closed, leaving the pool and pick log readable', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await close(id).expect(200);

    expect(
      (await pick(id, 'lightning-bolt-oracle', bobCookie).expect(409)).body
        .error,
    ).toBe('not-drafting');
    await request(app.getHttpServer())
      .delete(`/api/drafts/${id}/picks/1`)
      .set('Cookie', aliceCookie)
      .expect(409);
    expect((await post(id, 'pause').expect(409)).body.error).toBe(
      'not-drafting',
    );
    expect((await post(id, 'resume').expect(409)).body.error).toBe(
      'not-paused',
    );

    expect((await pickLog(id)).body).toHaveLength(1);
    const pool = await request(app.getHttpServer())
      .get(`/api/drafts/${id}/pool`)
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(pool.body).toHaveLength(cards.length);
  });

  it('refuses every queue edit while closed, and keeps the queue saved', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
    const saved = (await queue(id, bobCookie).expect(200)).body;
    await close(id).expect(200);

    const refused = await enqueue(id, 'shock-oracle', bobCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'draft-closed',
      message: 'This draft is closed.',
    });
    await request(app.getHttpServer())
      .put(`/api/drafts/${id}/queue`)
      .set('Cookie', bobCookie)
      .send({ oracleIds: ['lava-spike-oracle'] })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/drafts/${id}/queue/lava-spike-oracle`)
      .set('Cookie', bobCookie)
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/drafts/${id}/queue/lost`)
      .set('Cookie', bobCookie)
      .expect(409);

    expect((await queue(id, bobCookie).expect(200)).body).toEqual(saved);
  });

  it('returns to Drafting even if it was paused, and cascades queued picks', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await enqueue(id, 'lava-spike-oracle').expect(200);
    await enqueue(id, 'shock-oracle').expect(200);
    await start(id).expect(200);
    // Lava Spike was picked for Alice; undoing it brings back her turn.
    await undo(id, 1).expect(200);
    await post(id, 'pause').expect(200);
    await close(id).expect(200);

    const reopened = await reopen(id).expect(200);

    expect(reopened.body).toMatchObject({
      state: 'Drafting',
      turn: { pick: 2, round: 1, playerId: bob.id },
    });
    expect(
      (await pickLog(id)).body.map((p: { name: string }) => p.name),
    ).toEqual(['Shock']);
  });

  it('announces a close pinging nobody, and a reopen pinging whoever is up', async () => {
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
    await enqueue(id, 'lava-spike-oracle').expect(200);
    await enqueue(id, 'shock-oracle').expect(200);
    await start(id).expect(200);
    // Lava Spike was picked for Alice; undoing it brings back her turn.
    await undo(id, 1).expect(200);
    await close(id).expect(200);
    await reopen(id).expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    const link = `<https://roto.example/drafts/${id}>`;
    expect(messages.slice(2)).toEqual([
      {
        content: `**Red** has been closed\n${link}`,
        allowed_mentions: { parse: [], users: [] },
      },
      {
        content:
          '**Red** has reopened\n' +
          '**Alice** picked **Shock** (pick 1, queued)\n' +
          `<@${bob.id}> you’re up\n${link}`,
        allowed_mentions: { parse: [], users: [bob.id] },
      },
    ]);
  });
});
