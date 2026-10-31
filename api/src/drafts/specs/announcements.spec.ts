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
        `<@${alice.id}> you’re up\n` +
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
    const link = `<https://roto.example/drafts/${id}>`;

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
      `**Alice** picked **Shock** (pick 1)\n<@${bob.id}> you’re up\n${link}`,
      `**Bob** picked **Lava Spike** (pick 2)\n${link}`,
      `**Red** is complete. See everyone’s picks:\n${link}`,
    ]);
    expect(webhookClient.post.mock.calls[1][1].allowed_mentions).toEqual({
      parse: [],
      users: [bob.id],
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
