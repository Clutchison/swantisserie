import { Logger } from '@nestjs/common';
import request from 'supertest';
import { WebhookGoneError } from '../../discord/webhook-client.js';
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
  post,
  undo,
} from './harness.js';

useDraftsApp();

describe('announcements', () => {
  const webhookUrl = 'https://discord.com/api/webhooks/1234567890/secret-token';
  let bobCookie: string;
  let webhookId: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    const res = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .set('Cookie', await signIn(carol))
      .send({ name: '#roto-main', url: webhookUrl })
      .expect(201);
    webhookId = res.body.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Each post's content, once `count` have been made. */
  async function posted(count: number) {
    return vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(count);
      return webhookClient.post.mock.calls.map(
        ([, message]) => message.content,
      );
    });
  }

  it('announces the start to the draft’s webhook, with the seat order', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );

    await start(id).expect(200);

    expect(await posted(1)).toEqual([
      '**Red** has started. Seat order:\n' +
        '1. **Alice**\n' +
        '2. **Bob**\n' +
        `<@${alice.id}> you’re up.\n` +
        `<https://roto.example/drafts/${id}>`,
    ]);
    expect(webhookClient.post).toHaveBeenCalledWith(webhookUrl, {
      content: expect.any(String),
      allowed_mentions: { parse: [], users: [alice.id] },
    });
  });
  it('announces each pick, pinging the next player, then the draft’s end', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    await start(id).expect(200);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', bobCookie)
      .send({ oracleId: 'lava-spike-oracle' })
      .expect(200);

    expect((await posted(4)).slice(1)).toEqual([
      `1- **Alice** picked **Shock**\n<@${bob.id}> you’re up.`,
      '2- **Bob** picked **Lava Spike**',
      '**Red** is complete',
    ]);
    expect(webhookClient.post.mock.calls[1][1].allowed_mentions).toEqual({
      parse: [],
      users: [bob.id],
    });
  });

  describe('when a pick leaves its player up', () => {
    const cards = [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ];

    /** A draft of Alice then Bob, so Bob makes picks 2 and 3 in a row. */
    function snakeDraft() {
      return readyDraft([aliceCookie, bobCookie], 2, cards, webhookId);
    }

    /** The latest post made, once `count` have been. */
    async function lastPost(count: number) {
      await posted(count);
      return webhookClient.post.mock.calls[count - 1][1];
    }

    it('names them without a ping after a by-hand pick', async () => {
      const id = await snakeDraft();
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);

      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

      expect(await lastPost(3)).toEqual({
        content: '2- **Bob** picked **Lightning Bolt**\n**Bob** is up.',
        allowed_mentions: { parse: [], users: [] },
      });
    });

    it('pings them after a queued pick in a pick’s cascade', async () => {
      const id = await snakeDraft();
      await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      await start(id).expect(200);

      await pick(id, 'shock-oracle').expect(200);

      expect(await lastPost(2)).toEqual({
        content:
          '1- **Alice** picked **Shock**\n' +
          '2- **Bob** picked **Lightning Bolt**\n' +
          `<@${bob.id}> you’re up.`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it('pings them after a queued pick in a start’s cascade', async () => {
      const id = await snakeDraft();
      await enqueue(id, 'shock-oracle').expect(200);
      await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);

      await start(id).expect(200);

      expect((await lastPost(1)).allowed_mentions.users).toEqual([bob.id]);
    });

    it.each([
      ['pause', 'resume', 'has resumed'],
      ['close', 'reopen', 'has reopened'],
    ])(
      'pings them after a queued pick when a %s ends in a %s’s cascade',
      async (stop, carryOn, happened) => {
        const id = await snakeDraft();
        await enqueue(id, 'lava-spike-oracle', bobCookie).expect(200);
        await enqueue(id, 'skewer-the-critics-oracle', bobCookie).expect(200);
        await enqueue(id, 'lightning-bolt-oracle', bobCookie).expect(200);
        await start(id).expect(200);
        await pick(id, 'shock-oracle').expect(200);
        // Undoing both of Bob's queued picks leaves his turn with one card
        // waiting, which fires as pick 2 and leaves him up for pick 3.
        await undo(id, 3).expect(200);
        await undo(id, 2).expect(200);
        await post(id, stop).expect(200);

        await post(id, carryOn).expect(200);

        expect(await lastPost(6)).toEqual({
          content:
            `**Red** ${happened}\n` +
            '2- **Bob** picked **Lightning Bolt**\n' +
            `<@${bob.id}> you’re up.`,
          allowed_mentions: { parse: [], users: [bob.id] },
        });
      },
    );

    it('pings them on an undo of their second pick in a row', async () => {
      const id = await snakeDraft();
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      await pick(id, 'lava-spike-oracle', bobCookie).expect(200);

      await undo(id, 3).expect(200);

      expect(await lastPost(5)).toEqual({
        content:
          'Undone: 3- **Bob** picked **Lava Spike**\n' +
          `<@${bob.id}> you’re up.`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it('pings them on a resume after their by-hand pick', async () => {
      const id = await snakeDraft();
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
      await post(id, 'pause').expect(200);

      await post(id, 'resume').expect(200);

      expect((await lastPost(5)).allowed_mentions.users).toEqual([bob.id]);
    });
  });

  it('posts nothing for a draft without a webhook', async () => {
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);

    // Give a stray post the chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(webhookClient.post).not.toHaveBeenCalled();
  });

  it('retries a failed post, and keeps the pick when every try fails', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    await start(id).expect(200);
    await posted(1);
    webhookClient.post.mockRejectedValue(new Error('Discord is down'));
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);

    // The first try and two retries.
    await posted(4);
    await vi.waitFor(() =>
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('Discord is down'),
      ),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-token');
    expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
  });

  it('gets a post through on a retry', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    webhookClient.post.mockRejectedValueOnce(new Error('Discord is down'));

    await start(id).expect(200);

    const [first, retried] = await posted(2);
    expect(retried).toBe(first);
    expect(first).toContain('has started');
  });

  it('doesn’t retry a webhook Discord no longer has', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    webhookClient.post.mockRejectedValue(new WebhookGoneError());
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await start(id).expect(200);

    await vi.waitFor(() => expect(logged).toHaveBeenCalled());
    expect(webhookClient.post).toHaveBeenCalledTimes(1);
  });
});
