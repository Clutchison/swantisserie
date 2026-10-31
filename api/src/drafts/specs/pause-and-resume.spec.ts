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
  undoPick,
  readyDraft,
  start,
} from './harness.js';

useDraftsApp();

describe('pause and resume', () => {
  const cards = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  function pick(id: string, oracleId: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', cookie)
      .send({ oracleId });
  }

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

  function enqueue(id: string, oracleId: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/queue`)
      .set('Cookie', cookie)
      .send({ oracleId })
      .expect(200);
  }

  /** The pick log as `Player: Card` lines. */
  async function pickLog(id: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .expect(200);
    const names = { [alice.id]: 'Alice', [bob.id]: 'Bob' };
    return (res.body as { playerId: string; name: string }[]).map(
      (pick) => `${names[pick.playerId] ?? 'Bot'}: ${pick.name}`,
    );
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
    expect(await pickLog(id)).toEqual([]);

    const resumed = await resume(id).expect(200);

    expect(resumed.body).toMatchObject({
      state: 'Drafting',
      turn: { pick: 1, playerId: alice.id },
    });
    await pick(id, 'shock-oracle').expect(200);
    expect(await pickLog(id)).toEqual(['Alice: Shock']);
  });

  it('makes the queued picks due on resume, cascading from whoever is up', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await enqueue(id, 'lava-spike-oracle', bobCookie);
    await enqueue(id, 'skewer-the-critics-oracle', bobCookie);
    await enqueue(id, 'lightning-bolt-oracle', bobCookie);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);
    // Bob's cascade ran; undoing its last pick leaves his turn with a card waiting.
    await undoPick(id, 3);
    await pause(id).expect(200);
    // Queued while paused, off turn: nothing is picked yet.
    await enqueue(id, 'skewer-the-critics-oracle');
    expect(await pickLog(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);

    const resumed = await resume(id).expect(200);

    expect(resumed.body).toMatchObject({ state: 'Complete', turn: null });
    expect(await pickLog(id)).toEqual([
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
    await enqueue(id, 'lava-spike-oracle');
    await enqueue(id, 'shock-oracle');
    await start(id).expect(200);
    // Lava Spike was picked for Alice; undoing it brings back her turn.
    await undoPick(id, 1);
    await pause(id).expect(200);

    await resume(id).expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    const link = `<https://roto.example/drafts/${id}>`;
    expect(messages.slice(2)).toEqual([
      {
        content: `**Red** is paused\n${link}`,
        allowed_mentions: { parse: [], users: [] },
      },
      {
        content:
          '**Red** has resumed\n' +
          '**Alice** picked **Shock** (pick 1, queued)\n' +
          `<@${bob.id}> you’re up\n${link}`,
        allowed_mentions: { parse: [], users: [bob.id] },
      },
    ]);
  });
});
