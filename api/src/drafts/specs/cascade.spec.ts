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
  getDraft,
  readyDraft,
  start,
  enqueue,
  pick,
  pickLogLines,
  post,
  queue,
  undo,
} from './harness.js';

useDraftsApp();

describe('cascade', () => {
  const cards = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks the next player’s queued cards for them after a pick, through the snake turn', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
    await enqueue(id, 'skewer-the-critics-oracle', bobCookie).expect(200);
    await start(id).expect(200);

    const picked = await pick(id, 'shock-oracle').expect(200);

    // Bob picks last in round 1 and first in round 2.
    expect(picked.body.turn).toEqual({
      pick: 4,
      round: 2,
      playerId: alice.id,
    });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lava Spike',
      'Bob: Skewer the Critics',
    ]);
    expect((await queue(id, bobCookie).expect(200)).body).toEqual({
      cards: [],
      lost: [],
      cleared: [],
    });
  });

  it('stops at a player whose queue another player’s pick has just cleared', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await enqueue(id, 'shock-oracle', bobCookie).expect(200);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
    await start(id).expect(200);

    const picked = await pick(id, 'shock-oracle').expect(200);

    expect(picked.body.turn).toEqual({ pick: 2, round: 1, playerId: bob.id });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    expect((await queue(id, bobCookie).expect(200)).body).toEqual({
      cards: [],
      lost: [{ oracleId: 'shock-oracle', name: 'Shock' }],
      cleared: [{ oracleId: 'lava-spike-oracle', name: 'Lava Spike' }],
    });
  });

  it('clears a queue mid-cascade: a queued pick from a start stops at the player it cleared', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await enqueue(id, 'shock-oracle').expect(200);
    await enqueue(id, 'lightning-bolt-oracle').expect(200);
    await enqueue(id, 'shock-oracle', bobCookie).expect(200);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);

    const started = await start(id).expect(200);

    expect(started.body.turn).toEqual({ pick: 2, round: 1, playerId: bob.id });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    // Alice's own pick leaves the rest of her queue in place.
    expect((await queue(id).expect(200)).body).toEqual({
      cards: [{ oracleId: 'lightning-bolt-oracle', name: 'Lightning Bolt' }],
      lost: [],
      cleared: [],
    });
  });

  it.each([
    ['resume', 'pause', 'resume'],
    ['reopen', 'close', 'reopen'],
  ])(
    'clears a queue in the cascade after a %s',
    async (_name, stop, restart) => {
      const carolCookie = await signIn(carol);
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        cards,
      );
      await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      // Bob's turn is back, with Lava Spike still queued, and waits for him.
      await undo(id, 2).expect(200);
      await enqueue(id, 'lava-spike-oracle', carolCookie).expect(200);
      await enqueue(id, 'skewer-the-critics-oracle', carolCookie).expect(200);
      await post(id, stop).expect(200);

      const restarted = await post(id, restart).expect(200);

      expect(restarted.body.turn.playerId).toBe(carol.id);
      expect(await pickLogLines(id)).toEqual([
        'Alice: Shock',
        'Bob: Lava Spike',
      ]);
      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [{ oracleId: 'lava-spike-oracle', name: 'Lava Spike' }],
        cleared: [
          { oracleId: 'skewer-the-critics-oracle', name: 'Skewer the Critics' },
        ],
      });
    },
  );

  it('picks the first player’s queued card when the draft starts', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    await enqueue(id, 'lightning-bolt-oracle').expect(200);

    const started = await start(id).expect(200);

    expect(started.body.turn).toEqual({
      pick: 2,
      round: 1,
      playerId: bob.id,
    });
    expect(await pickLogLines(id)).toEqual(['Alice: Lightning Bolt']);
  });

  it('stops at a bot’s turn, and carries on after the bot picks', async () => {
    const id = await readyDraft([aliceCookie], 2, cards);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/bots`)
      .set('Cookie', await signIn(carol))
      .expect(201);
    // The bot picks the first available card by name.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await enqueue(id, 'shock-oracle').expect(200);
    await enqueue(id, 'skewer-the-critics-oracle').expect(200);

    const started = await start(id).expect(200);

    expect(started.body.turn.pick).toBe(2);
    await vi.waitFor(async () => {
      expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
    });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bot: Lava Spike',
      'Bot: Lightning Bolt',
      'Alice: Skewer the Critics',
    ]);
  });

  it('announces a pick and its cascade in one post, pinging who must pick next', async () => {
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
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
    await enqueue(id, 'skewer-the-critics-oracle', bobCookie).expect(200);
    await start(id).expect(200);

    await pick(id, 'shock-oracle').expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages[1]).toEqual({
      content:
        '**Alice** picked **Shock** (pick 1)\n' +
        '**Bob** picked **Lava Spike** (pick 2, queued)\n' +
        '**Bob** picked **Skewer the Critics** (pick 3, queued)\n' +
        `<@${alice.id}> you’re up`,
      allowed_mentions: { parse: [], users: [alice.id] },
    });
  });

  it('adds nothing about a cleared queue to the announcement, only the usual ping', async () => {
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
    await enqueue(id, 'shock-oracle', bobCookie).expect(200);
    await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
    await start(id).expect(200);

    await pick(id, 'shock-oracle').expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages[1]).toEqual({
      content:
        '**Alice** picked **Shock** (pick 1)\n' + `<@${bob.id}> you’re up`,
      allowed_mentions: { parse: [], users: [bob.id] },
    });
  });
});
