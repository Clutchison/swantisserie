import { Logger } from '@nestjs/common';
import type { DraftView } from 'contract';
import type { MockInstance } from 'vitest';
import { DraftPushes } from '../draft-pushes.js';
import {
  DraftNotifier,
  RATE_LIMIT_CAP_MS,
  RATE_LIMIT_MIN_WAIT_MS,
  RateLimitPastCapError,
} from '../../discord/draft-notifier.js';
import {
  WebhookGoneError,
  webhookPostError,
  WebhookRateLimitedError,
  WebhookRefusedError,
} from '../../discord/webhook-client.js';
import { useDeadlineTimers } from '../../testing/deadlines.js';
import {
  alice,
  bob,
  carol,
  aliceCookie,
  app,
  webhookClient,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  readyDraftOfDoubleTurns,
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
  failedPushes,
  queueInLobby,
  renameWebhook,
  replaceWebhookUrl,
} from './harness.js';
import { expectPushedOnce, useSockets, versionsOf } from './socket-harness.js';

const sideUrl = 'https://discord.com/api/webhooks/1234567891/side-token';

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
      it('names them without a ping after their first pick by hand', async () => {
        const id = await readyDraftOfDoubleTurns(
          [aliceCookie, bobCookie],
          webhookId,
        );
        const ids = await poolCardIds(id);
        await start(id).expect(200);

        await pick(id, ids.Shock).expect(200);

        expect(await lastPost(id, 2)).toEqual({
          content: `1- **Alice** picked **Shock**\n**Alice** is up. [Open draft](<https://roto.example/drafts/${id}>)`,
          allowed_mentions: { parse: [], users: [] },
        });
      });

      it('pings them after their first pick came from their queue', async () => {
        const id = await readyDraftOfDoubleTurns(
          [aliceCookie, bobCookie],
          webhookId,
        );
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

  describe('when Discord rate limits a post', () => {
    /** Longer than the 1 s and 5 s the retries wait outside tests. */
    const RATE_LIMIT_MS = 10_000;

    beforeEach(useDeadlineTimers);
    afterEach(() => vi.useRealTimers());

    it('waits as long as Discord says, then gets the post through', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      webhookClient.post.mockRejectedValueOnce(
        new WebhookRateLimitedError(RATE_LIMIT_MS),
      );
      await start(id).expect(200);
      await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

      await vi.advanceTimersByTimeAsync(RATE_LIMIT_MS - 1);
      expect(webhookClient.post).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      const [first, retried] = await posted(id, 2);
      expect(retried).toBe(first);
      expect(first).toContain('has started');
    });

    it('holds another draft’s post on the same webhook until it is over', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      const other = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      webhookClient.post.mockRejectedValueOnce(
        new WebhookRateLimitedError(RATE_LIMIT_MS),
      );
      await start(id).expect(200);
      await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

      await start(other).expect(200);
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_MS - 1);
      expect(webhookClient.post).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await announcementsSettled(other);
      await posted(id, 3);
    });

    it('waits a little even when Discord says not to wait', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      webhookClient.post.mockRejectedValueOnce(new WebhookRateLimitedError(0));
      await start(id).expect(200);
      await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

      await vi.advanceTimersByTimeAsync(RATE_LIMIT_MIN_WAIT_MS - 1);
      expect(webhookClient.post).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await posted(id, 2);
    });

    it('drops and logs posts while the wait would pass the cap, without a request, then posts again', async () => {
      const id = await readyDraft(
        [aliceCookie, bobCookie],
        1,
        undefined,
        webhookId,
      );
      const ids = await poolCardIds(id);
      const rateLimitMs = RATE_LIMIT_CAP_MS + RATE_LIMIT_MS;
      webhookClient.post.mockRejectedValueOnce(
        new WebhookRateLimitedError(rateLimitMs),
      );
      const logged = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      await start(id).expect(200);

      // Sent no request: it would only be rate limited too.
      await pick(id, ids.Shock).expect(200);
      await posted(id, 1);
      const pastCap = expect.stringContaining(
        `draft ${id}: ${RateLimitPastCapError.name}`,
      );
      expect(logged.mock.calls).toEqual([[pastCap], [pastCap]]);

      await vi.advanceTimersByTimeAsync(rateLimitMs);
      await app.get(DraftNotifier).notify(id, [{ type: 'frozen' }]);

      const [dropped, next] = await posted(id, 2);
      expect(dropped).toContain('has started');
      expect(next).not.toContain('has started');
      expect(logged).toHaveBeenCalledTimes(2);
    });
  });

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

    describe('the drafts using it', () => {
      const { listening, listeningToOwnRoom } = useSockets();

      /** Two Drafting drafts, then a Lobby one, all using the webhook. */
      let draftIds: string[];
      let logged: MockInstance<Logger['error']>;

      beforeEach(async () => {
        const drafting = await readyDraft(
          [aliceCookie, bobCookie],
          1,
          undefined,
          webhookId,
        );
        const other = await readyDraft(
          [aliceCookie, bobCookie],
          1,
          undefined,
          webhookId,
        );
        const lobby = await readyDraft([aliceCookie], 1, undefined, webhookId);
        draftIds = [drafting, other, lobby];
        logged = vi
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => {});
      });

      /**
       * Makes the next post wait until the returned function is called,
       * then fail with `err`.
       */
      function holdNextPost() {
        let fail!: (err: Error) => void;
        const held = new Promise<void>((_, reject) => (fail = reject));
        webhookClient.post.mockImplementationOnce(() => held);
        return fail;
      }

      /** Each draft's version now, by id. */
      const versions = () => versionsOf(draftIds);

      /**
       * What is pushed from now on to a socket watching each draft, and to
       * Alice's and Bob's own rooms: Alice plays in every draft, Bob in the
       * Drafting ones.
       */
      async function listeningToEach() {
        return listening(draftIds, await signIn(carol), {
          alice: aliceCookie,
          bob: bobCookie,
        });
      }

      /** Expects `draft` to show the webhook gone. */
      function showsGone(draft: DraftView) {
        expect(draft.webhook).toEqual({
          id: webhookId,
          name: '#roto-main',
          gone: true,
        });
      }

      it('pushes each of them, newer and gone, to its watchers and each of its players, announcing nothing', async () => {
        const [drafting] = draftIds;
        const fail = holdNextPost();
        await start(drafting).expect(200);
        const before = await versions();
        const { watched, rooms } = await listeningToEach();

        fail(new WebhookGoneError(404));

        await announcementsSettled(drafting);
        await expectPushedOnce(rooms.alice, draftIds, before, showsGone);
        const bobsDrafts = draftIds.slice(0, 2);
        await expectPushedOnce(rooms.bob, bobsDrafts, before, showsGone);
        for (const id of draftIds) {
          await expectPushedOnce(watched[id], [id], before, showsGone);
        }
        expect(webhookClient.post).toHaveBeenCalledOnce();
      });

      /** Whether draft `id` shows its webhook gone. */
      async function webhookGone(id: string): Promise<boolean> {
        return (await getDraft(id).expect(200)).body.webhook.gone;
      }

      /**
       * Renames the webhook, which pushes every draft, and expects `pushed`,
       * once it hears of each, to have heard nothing before that but its
       * first `earlier` drafts.
       */
      async function renameExpectingNothingPushedSince(
        pushed: DraftView[],
        earlier: number,
      ) {
        await renameWebhook(webhookId, '#roto-league');
        await vi.waitFor(() =>
          expect(pushed).toHaveLength(earlier + draftIds.length),
        );
        expect(
          pushed.slice(earlier).map((draft) => draft.webhook?.name),
        ).toEqual(draftIds.map(() => '#roto-league'));
      }

      it('bumps and pushes nothing for a second post finding it gone', async () => {
        const [drafting, other] = draftIds;
        const failFirst = holdNextPost();
        const failSecond = holdNextPost();
        await start(drafting).expect(200);
        await start(other).expect(200);
        // Both read the webhook before either post failed.
        await vi.waitFor(() =>
          expect(webhookClient.post).toHaveBeenCalledTimes(2),
        );
        const alicesRoom = (await listeningToOwnRoom(aliceCookie)).changes;
        failFirst(new WebhookGoneError(404));
        await vi.waitFor(() => expect(alicesRoom).toHaveLength(3));
        const before = await versions();

        failSecond(new WebhookGoneError(404));

        await Promise.all(draftIds.map(announcementsSettled));
        expect(await versions()).toEqual(before);
        expect(logged).toHaveBeenCalledOnce();
        await renameExpectingNothingPushedSince(alicesRoom, 3);
      });

      it('bumps and pushes nothing for a post finding gone a URL since replaced', async () => {
        const [drafting] = draftIds;
        const fail = holdNextPost();
        await start(drafting).expect(200);
        await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());
        await replaceWebhookUrl(webhookId, sideUrl);
        const before = await versions();
        const alicesRoom = (await listeningToOwnRoom(aliceCookie)).changes;

        fail(new WebhookGoneError(404));

        await announcementsSettled(drafting);
        expect(await versions()).toEqual(before);
        expect(await webhookGone(drafting)).toBe(false);
        await renameExpectingNothingPushedSince(alicesRoom, 0);
      });

      it('leaves the webhook not gone if bumping its drafts fails', async () => {
        const [drafting] = draftIds;
        webhookClient.post.mockRejectedValueOnce(new WebhookGoneError(404));
        vi.spyOn(DraftPushes.prototype, 'bump').mockRejectedValueOnce(
          new Error('Connection dropped'),
        );

        await start(drafting).expect(200);

        await announcementsSettled(drafting);
        expect(await webhookGone(drafting)).toBe(false);
      });

      it('logs a push that fails, still pushing the rest and announcing on other webhooks', async () => {
        const sideId = await registerWebhook('#roto-side', sideUrl);
        const elsewhere = await readyDraft(
          [aliceCookie, bobCookie],
          1,
          undefined,
          sideId,
        );
        const [drafting] = draftIds;
        const fail = holdNextPost();
        await start(drafting).expect(200);
        const before = await versions();
        const alicesRoom = (await listeningToOwnRoom(aliceCookie)).changes;
        vi.spyOn(DraftPushes.prototype, 'push').mockRejectedValueOnce(
          new Error('Connection dropped'),
        );

        fail(new WebhookGoneError(404));

        await announcementsSettled(drafting);
        const failures = failedPushes(logged, draftIds);
        expect(failures).toEqual([
          { draftId: expect.any(String), err: expect.any(Error) },
        ]);
        const [{ draftId: failed }] = failures;
        // The rest are still pushed, and the failed one isn't.
        await vi.waitFor(() => expect(alicesRoom).toHaveLength(2));
        expect(alicesRoom.map((draft) => draft.id).sort()).toEqual(
          draftIds.filter((id) => id !== failed).sort(),
        );
        await renameExpectingNothingPushedSince(alicesRoom, 2);
        // Its change still committed.
        expect((await versions()).get(failed)).toBeGreaterThan(
          before.get(failed)!,
        );
        expect(await webhookGone(failed)).toBe(true);
        await start(elsewhere).expect(200);
        await announcementsSettled(elsewhere);
        expect(webhookClient.post).toHaveBeenLastCalledWith(
          sideUrl,
          expect.anything(),
        );
      });
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
