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
  enqueue,
  pickLogLines,
  undo,
} from './harness.js';

useDraftsApp();

describe('pause and resume', () => {
  const cards = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  function pause(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/pause`)
      .set('Cookie', cookie);
  }

  function resume(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/resume`)
      .set('Cookie', cookie);
  }

  it('pauses the draft, refusing picks until it resumes', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);

    const paused = await pause(id).expect(200);

    expect(paused.body).toMatchObject({
      state: 'Paused',
      turn: { pick: 1, playerId: alice.id },
    });
    const refused = await pick(id, 'shock-oracle').expect(409);
    expect(refused.body.error).toBe('not-drafting');
    expect(await pickLogLines(id)).toEqual([]);

    const resumed = await resume(id).expect(200);

    expect(resumed.body).toMatchObject({
      state: 'Drafting',
      turn: { pick: 1, playerId: alice.id },
    });
    await pick(id, 'shock-oracle').expect(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
  });

  it('makes the queued picks due on resume, cascading from whoever is up', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
    await enqueue(id, 'skewer-the-critics-oracle', bobCookie).expect(200);
    await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    // Bob's cascade ran; undoing its last pick leaves his turn with a card waiting.
    await undo(id, 3).expect(200);
    await pause(id).expect(200);
    // Queued while paused, off turn: nothing is picked yet.
    await enqueue(id, 'skewer-the-critics-oracle').expect(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);

    const resumed = await resume(id).expect(200);

    expect(resumed.body).toMatchObject({ state: 'Complete', turn: null });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lava Spike',
      'Bob: Lightning Bolt',
      'Alice: Skewer the Critics',
    ]);
  });

  it('refuses to pause a draft that is not drafting, or resume one that is not paused', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    expect((await pause(id).expect(409)).body.error).toBe('not-drafting');
    expect((await resume(id).expect(409)).body.error).toBe('not-paused');
    await start(id).expect(200);
    expect((await resume(id).expect(409)).body.error).toBe('not-paused');
    await pause(id).expect(200);
    expect((await pause(id).expect(409)).body.error).toBe('not-drafting');
    await resume(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

    const refused = await pause(id).expect(409);

    expect(refused.body.error).toBe('not-drafting');
  });

  it('lets an app admin pause and resume, but not other players', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await start(id).expect(200);
    const carolCookie = await signIn(carol);

    await pause(id, bobCookie).expect(403);
    await pause(id, carolCookie).expect(200);
    await resume(id, bobCookie).expect(403);
    await resume(id, carolCookie).expect(200);
    await pause('no-such-draft').expect(404);
  });

  it('announces a pause, and pings whoever is up on resume', async () => {
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
    await pause(id).expect(200);

    await resume(id).expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages.slice(2)).toEqual([
      {
        content: '**Red** is paused',
        allowed_mentions: { parse: [], users: [] },
      },
      {
        content:
          '**Red** has resumed\n' +
          '**Alice** picked **Shock** (pick 1, queued)\n' +
          `<@${bob.id}> you’re up`,
        allowed_mentions: { parse: [], users: [bob.id] },
      },
    ]);
  });
});
