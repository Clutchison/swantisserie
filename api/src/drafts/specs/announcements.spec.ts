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
  announcementsSettled,
  queueInLobby,
} from './harness.js';

useDraftsApp();

describe('announcements', () => {
  let bobCookie: string;
  let webhookId: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    webhookId = await registerWebhook();
  });

  /**
   * Each post's content, once the draft's announcements have settled,
   * expecting exactly `count` posts.
   */
  async function posted(id: string, count: number) {
    await announcementsSettled(id);
    expect(webhookClient.post).toHaveBeenCalledTimes(count);
    return webhookClient.post.mock.calls.map(([, message]) => message.content);
  }

  it('announces the start to the draft’s webhook, with the seat order', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );

    await start(id).expect(200);

    expect(await posted(id, 1)).toEqual([
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

    expect((await posted(id, 4)).slice(1)).toEqual([
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

    /** The latest post, once the draft's announcements have settled, expecting exactly `count`. */
    async function lastPost(id: string, count: number) {
      await posted(id, count);
      return webhookClient.post.mock.calls[count - 1][1];
    }

    it('names them without a ping after a by-hand pick', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);

      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

      expect(await lastPost(id, 3)).toEqual({
        content: `2- **Bob** picked **Lightning Bolt**\n**Bob** is up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [] },
      });
    });

    it('pings them after a queued pick in a pick’s cascade', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);

      await pick(id, ids.Shock).expect(200);

      expect(await lastPost(id, 2)).toEqual({
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
      // Queues already filled in the lobby.
      await queueInLobby(id, alice, ids.Shock);
      await queueInLobby(id, bob, ids['Lightning Bolt']);

      await start(id).expect(200);

      expect(await lastPost(id, 1)).toEqual({
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

    describe('on a double turn', () => {
      /** Alice then Bob, two picks each, both on double turns: A A B B. */
      function doubleTurnDraft() {
        return readyDraft([aliceCookie, bobCookie], 2, fourCards, webhookId, 2);
      }

      it('names them without a ping after their first pick by hand', async () => {
        const id = await doubleTurnDraft();
        const ids = await poolCardIds(id);
        await start(id).expect(200);

        await pick(id, ids.Shock).expect(200);

        expect(await lastPost(id, 2)).toEqual({
          content: `1- **Alice** picked **Shock**\n**Alice** is up. [Open draft](<https://roto.example/drafts/${id}>)`,
          allowed_mentions: { parse: [], users: [] },
        });
      });

      it('pings them after their first pick came from their queue', async () => {
        const id = await doubleTurnDraft();
        const ids = await poolCardIds(id);
        // A queue already filled in the lobby, with one card.
        await queueInLobby(id, alice, ids.Shock);

        await start(id).expect(200);

        expect(await lastPost(id, 1)).toEqual({
          content:
            '**Red** has started. Seat order:\n' +
            '1. **Alice**\n' +
            '2. **Bob**\n' +
            '1- **Alice** picked **Shock**\n' +
            `<@${alice.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
          allowed_mentions: { parse: [], users: [alice.id] },
        });
      });
    });

    it.each([
      ['freeze', 'unfreeze', 'has been unfrozen'],
      ['close', 'reopen', 'has reopened'],
    ])(
      'pings them after a queued pick when a %s ends in a %s’s cascade',
      async (stop, carryOn, happened) => {
        const id = await snakeDraft();
        const ids = await poolCardIds(id);
        await start(id).expect(200);
        await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
        await pick(id, ids.Shock).expect(200);
        // Undoing Bob's queued pick puts its card back in his queue, waiting,
        // which fires as pick 2 and leaves him up for pick 3.
        await undo(id, 2).expect(200);
        await post(id, stop).expect(200);

        await post(id, carryOn).expect(200);

        expect(await lastPost(id, 5)).toEqual({
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

      expect(await lastPost(id, 5)).toEqual({
        content:
          'Undone: 3- **Bob** picked **Lava Spike**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it('pings them on an unfreeze after their by-hand pick', async () => {
      const id = await snakeDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await post(id, 'freeze').expect(200);

      await post(id, 'unfreeze').expect(200);

      expect(await lastPost(id, 5)).toEqual({
        content: `**Red** has been unfrozen\n<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
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
    await start(id).expect(200);
    await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);

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
   * making an announcement too long for one post: its queues are already
   * filled in the lobby.
   */
  async function longCascadeDraft() {
    const cards = Array.from(
      { length: 50 },
      (_, i) => `Card With A Long Enough Name ${String(i).padStart(2, '0')}`,
    );
    const id = await readyDraft([aliceCookie, bobCookie], 25, cards, webhookId);
    const ids = await poolCardIds(id);
    await queueInLobby(
      id,
      alice,
      ...cards.slice(0, 25).map((card) => ids[card]),
    );
    await queueInLobby(
      id,
      bob,
      ...cards.slice(25, 49).map((card) => ids[card]),
    );
    return id;
  }

  it('posts an announcement too long for one post as several, in order, pinging only in the last', async () => {
    const id = await longCascadeDraft();

    await start(id).expect(200);

    await announcementsSettled(id);
    expect(webhookClient.post).toHaveBeenCalledTimes(2);
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

    const [refused, last] = await posted(id, 2);
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

    await announcementsSettled(id);
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
    await posted(id, 1);
    webhookClient.post.mockRejectedValue(new Error('Discord is down'));
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await pick(id, ids.Shock).expect(200);

    // The first try and two retries.
    await posted(id, 4);
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

    const [first, retried] = await posted(id, 2);
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

      const [first, retried] = await posted(id, 2);
      expect(retried).toBe(first);
    },
  );

  describe('when its webhook is gone', () => {
    it.each([404, 401])(
      'marks the webhook gone on a %i without retrying, and logs it once',
      async (status) => {
        const id = await readyDraft(
          [aliceCookie, bobCookie],
          1,
          undefined,
          webhookId,
        );
        webhookClient.post.mockRejectedValueOnce(webhookPostError(status));
        const logged = vi
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => {});

        await start(id).expect(200);

        await posted(id, 1);
        expect(logged).toHaveBeenCalledOnce();
        expect(logged).toHaveBeenCalledWith(
          expect.stringContaining(String(status)),
        );
        expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-token');
        expect((await getDraft(id).expect(200)).body.webhook.gone).toBe(true);
      },
    );

    it('posts no later announcement on it, from any draft, and logs none', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      // Made while the webhook can still be chosen.
      const other = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      const ids = await poolCardIds(id);
      webhookClient.post.mockRejectedValueOnce(new WebhookGoneError(404));
      const logged = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      await start(id).expect(200);
      await posted(id, 1);

      await pick(id, ids.Shock).expect(200);
      await start(other).expect(200);

      await announcementsSettled(other);
      await posted(id, 1);
      expect(logged).toHaveBeenCalledOnce();
    });

    it('doesn’t attempt the rest of the announcement whose post found it gone', async () => {
      const id = await longCascadeDraft();
      webhookClient.post.mockRejectedValueOnce(new WebhookGoneError(404));
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      await start(id).expect(200);

      await posted(id, 1);
    });
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

  it.each([403, 400, 429, 503])(
    'doesn’t mark the webhook gone on a %i',
    async (status) => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      webhookClient.post.mockRejectedValue(webhookPostError(status));
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      await start(id).expect(200);

      await announcementsSettled(id);
      expect((await getDraft(id).expect(200)).body.webhook.gone).toBe(false);
    },
  );

  it('doesn’t mark the webhook gone on a network error', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    webhookClient.post.mockRejectedValue(
      new Error('Discord webhook post failed: Discord could not be reached.'),
    );
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await start(id).expect(200);

    await announcementsSettled(id);
    expect((await getDraft(id).expect(200)).body.webhook.gone).toBe(false);
  });
});
