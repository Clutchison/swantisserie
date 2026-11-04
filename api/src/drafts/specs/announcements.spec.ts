import { Logger } from '@nestjs/common';
import {
  WebhookGoneError,
  webhookPostError,
  WebhookRefusedError,
} from '../../discord/webhook-client.js';
import {
  alice,
  bob,
  carol,
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
  poolCardIds,
  registerWebhook,
  webhookUrl,
  addBot,
  fourCards,
} from './harness.js';

useDraftsApp();

describe('announcements', () => {
  let bobCookie: string;
  let webhookId: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    webhookId = await registerWebhook();
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
        `<@${alice.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
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
    const ids = await poolCardIds(id);
    await start(id).expect(200);

    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lava Spike'], bobCookie).expect(200);

    expect((await posted(4)).slice(1)).toEqual([
      `1- **Alice** picked **Shock**\n<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
      '2- **Bob** picked **Lava Spike**',
      '**Red** is complete',
    ]);
    expect(webhookClient.post.mock.calls[1][1].allowed_mentions).toEqual({
      parse: [],
      users: [bob.id],
    });
  });

  describe('when a pick leaves its player up', () => {
    /** A draft of Alice then Bob, so Bob makes picks 2 and 3 in a row. */
    function snakeDraft() {
      return readyDraft([aliceCookie, bobCookie], 2, fourCards, webhookId);
    }

    /** The latest post made, once `count` have been. */
    async function lastPost(count: number) {
      await posted(count);
      return webhookClient.post.mock.calls[count - 1][1];
    }

    it('names them without a ping after a by-hand pick', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);

      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

      expect(await lastPost(3)).toEqual({
        content: `2- **Bob** picked **Lightning Bolt**\n**Bob** is up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [] },
      });
    });

    it('pings them after a queued pick in a pick’s cascade', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await start(id).expect(200);

      await pick(id, ids.Shock).expect(200);

      expect(await lastPost(2)).toEqual({
        content:
          '1- **Alice** picked **Shock**\n' +
          '2- **Bob** picked **Lightning Bolt**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it('pings them after a queued pick in a start’s cascade', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);

      await start(id).expect(200);

      expect(await lastPost(1)).toEqual({
        content:
          '**Red** has started. Seat order:\n' +
          '1. **Alice**\n' +
          '2. **Bob**\n' +
          '1- **Alice** picked **Shock**\n' +
          '2- **Bob** picked **Lightning Bolt**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it.each([
      ['pause', 'resume', 'has resumed'],
      ['close', 'reopen', 'has reopened'],
    ])(
      'pings them after a queued pick when a %s ends in a %s’s cascade',
      async (stop, carryOn, happened) => {
        const id = await snakeDraft();
        const ids = await poolCardIds(id);
        await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
        await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(200);
        await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
        await start(id).expect(200);
        await pick(id, ids.Shock).expect(200);
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
            `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
          allowed_mentions: { parse: [], users: [bob.id] },
        });
      },
    );

    it('pings them on an undo of their second pick in a row', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await pick(id, ids['Lava Spike'], bobCookie).expect(200);

      await undo(id, 3).expect(200);

      expect(await lastPost(5)).toEqual({
        content:
          'Undone: 3- **Bob** picked **Lava Spike**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it('pings them on a resume after their by-hand pick', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await post(id, 'pause').expect(200);

      await post(id, 'resume').expect(200);

      expect(await lastPost(5)).toEqual({
        content: `**Red** has resumed\n<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });
  });

  it('names a bot a cascade ends on after a by-hand pick, pinging no one', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      ['Shock', 'Lightning Bolt', 'Lava Spike'],
      webhookId,
    );
    const ids = await poolCardIds(id);
    await addBot(id, await signIn(carol)).expect(201);
    await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await start(id).expect(200);

    await pick(id, ids.Shock).expect(200);

    // The bot then picks on its own timer, so more posts may follow.
    const message = await vi.waitFor(() => {
      const call = webhookClient.post.mock.calls[1];
      expect(call).toBeDefined();
      return call[1];
    });
    expect(message).toEqual({
      content:
        '1- **Alice** picked **Shock**\n' +
        '2- **Bob** picked **Lightning Bolt**\n' +
        `**Bot 1** is up. [Open draft](<https://roto.example/drafts/${id}>)`,
      allowed_mentions: { parse: [], users: [] },
    });
  });

  /**
   * A draft whose start cascades through every pick but the last, Bob's,
   * making an announcement too long for one post.
   */
  async function longCascadeDraft() {
    const cards = Array.from(
      { length: 50 },
      (_, i) => `Card With A Long Enough Name ${String(i).padStart(2, '0')}`,
    );
    const id = await readyDraft([aliceCookie, bobCookie], 25, cards, webhookId);
    const ids = await poolCardIds(id);
    for (const card of cards.slice(0, 25)) {
      await enqueue(id, ids[card]).expect(200);
    }
    for (const card of cards.slice(25, 49)) {
      await enqueue(id, ids[card], bobCookie).expect(200);
    }
    return id;
  }

  it('posts an announcement too long for one post as several, in order, pinging only in the last', async () => {
    const id = await longCascadeDraft();

    await start(id).expect(200);

    await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalledTimes(2));
    const calls = webhookClient.post.mock.calls;
    expect(calls.map(([url]) => url)).toEqual([webhookUrl, webhookUrl]);
    const [first, last] = calls.map(([, message]) => message);
    expect(first.content.length).toBeLessThanOrEqual(2000);
    expect(last.content.length).toBeLessThanOrEqual(2000);
    const lines = `${first.content}\n${last.content}`.split('\n');
    expect(lines.slice(0, 3)).toEqual([
      '**Red** has started. Seat order:',
      '1. **Alice**',
      '2. **Bob**',
    ]);
    expect(lines.slice(3, -1).map((line) => line.split('-')[0])).toEqual(
      Array.from({ length: 49 }, (_, i) => String(i + 1)),
    );
    expect(lines.at(-1)).toBe(
      `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
    );
    expect(first.allowed_mentions).toEqual({ parse: [], users: [] });
    expect(last.allowed_mentions).toEqual({ parse: [], users: [bob.id] });
  });

  it('still posts the rest of an announcement when one of its posts is refused', async () => {
    const id = await longCascadeDraft();
    webhookClient.post.mockRejectedValueOnce(new WebhookRefusedError(400));
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await start(id).expect(200);

    const [refused, last] = await posted(2);
    expect(refused).toMatch(/^\*\*Red\*\* has started/);
    expect(last).toContain(`<@${bob.id}> you’re up.`);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('400'));
  });

  it('posts nothing for a draft without a webhook', async () => {
    const id = await readyDraft([aliceCookie, bobCookie]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);

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
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await posted(1);
    webhookClient.post.mockRejectedValue(new Error('Discord is down'));
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await pick(id, ids.Shock).expect(200);

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

  it.each([429, 503])(
    'retries a post that failed with a %i',
    async (status) => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      webhookClient.post.mockRejectedValueOnce(webhookPostError(status));

      await start(id).expect(200);

      const [first, retried] = await posted(2);
      expect(retried).toBe(first);
    },
  );

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

  it('doesn’t retry a post Discord refuses, and logs it', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    webhookClient.post.mockRejectedValue(new WebhookRefusedError(400));
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await start(id).expect(200);

    await vi.waitFor(() =>
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('400')),
    );
    expect(webhookClient.post).toHaveBeenCalledTimes(1);
  });
});
