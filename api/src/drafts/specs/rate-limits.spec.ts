import { Logger } from '@nestjs/common';
import {
  DraftNotifier,
  RATE_LIMIT_CAP_MS,
  RATE_LIMIT_MIN_WAIT_MS,
  RateLimitPastCapError,
} from '../../discord/draft-notifier.js';
import { WebhookRateLimitedError } from '../../discord/webhook-client.js';
import { useDeadlineTimers } from '../../testing/deadlines.js';
import {
  aliceCookie,
  announcementsSettled,
  app,
  bob,
  pick,
  poolCardIds,
  readyDraft,
  registerWebhook,
  signIn,
  start,
  useDraftsApp,
  webhookClient,
} from './harness.js';

useDraftsApp();

describe('when Discord rate limits a post', () => {
  /** Longer than the 1 s and 5 s the retries wait outside tests. */
  const RATE_LIMIT_MS = 10_000;
  /**
   * Room for the real time a step takes, which the fake clock counts too
   * (`shouldAdvanceTime`): a hold may end this much before the fake timers
   * have been advanced through it.
   */
  const SLACK_MS = 200;

  let bobCookie: string;
  let webhookId: string;

  beforeEach(async () => {
    useDeadlineTimers();
    bobCookie = await signIn(bob);
    webhookId = await registerWebhook();
  });
  afterEach(() => vi.useRealTimers());

  /** A draft ready to start, announcing on the webhook. */
  function draftOnWebhook(): Promise<string> {
    return readyDraft([aliceCookie, bobCookie], 1, undefined, webhookId);
  }

  /**
   * Each post's content, once the draft's announcements have settled,
   * expecting exactly `count` posts.
   */
  async function posted(id: string, count: number) {
    await announcementsSettled(id);
    expect(webhookClient.post).toHaveBeenCalledTimes(count);
    return webhookClient.post.mock.calls.map(([, message]) => message.content);
  }

  it('waits as long as Discord says, then gets the post through', async () => {
    const id = await draftOnWebhook();
    webhookClient.post.mockRejectedValueOnce(
      new WebhookRateLimitedError(RATE_LIMIT_MS),
    );
    await start(id).expect(200);
    await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_MS - SLACK_MS);
    expect(webhookClient.post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SLACK_MS);

    const [first, retried] = await posted(id, 2);
    expect(retried).toBe(first);
    expect(first).toContain('has started');
  });

  it('holds another draft’s post on the same webhook until it is over', async () => {
    const id = await draftOnWebhook();
    const other = await draftOnWebhook();
    webhookClient.post.mockRejectedValueOnce(
      new WebhookRateLimitedError(RATE_LIMIT_MS),
    );
    await start(id).expect(200);
    await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

    await start(other).expect(200);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_MS - SLACK_MS);
    expect(webhookClient.post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SLACK_MS);

    await announcementsSettled(other);
    await posted(id, 3);
  });

  it('waits a little even when Discord says not to wait', async () => {
    const id = await draftOnWebhook();
    webhookClient.post.mockRejectedValueOnce(new WebhookRateLimitedError(0));
    await start(id).expect(200);
    await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_MIN_WAIT_MS - SLACK_MS);
    expect(webhookClient.post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SLACK_MS);

    await posted(id, 2);
  });

  it('drops and logs posts while the wait would pass the cap, without a request, then posts again', async () => {
    const id = await draftOnWebhook();
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

  describe('once the hold is over', () => {
    /** Posts sent and not yet landed or failed, oldest first. */
    let sending: { land: () => void; fail: (err: Error) => void }[];

    beforeEach(() => {
      sending = [];
      webhookClient.post.mockImplementation(
        () =>
          new Promise<void>((land, fail) => {
            sending.push({ land, fail });
          }),
      );
    });
    afterEach(() => {
      // So shutdown doesn't wait on posts left sending by a failed spec.
      webhookClient.post.mockResolvedValue(undefined);
      for (const post of sending.splice(0)) post.land();
    });

    /** Which of `ids` each post so far is for, in the order sent. */
    function postedFor(ids: string[]): (string | undefined)[] {
      return webhookClient.post.mock.calls.map(([, { content }]) =>
        ids.find((id) => content.includes(`/drafts/${id}`)),
      );
    }

    /**
     * Expects the posts so far to be for `expected`, in order, with no more
     * sent meanwhile: the last one is still sending.
     */
    async function expectPostedFor(ids: string[], expected: string[]) {
      await vi.waitFor(() => expect(postedFor(ids)).toEqual(expected));
      await vi.advanceTimersByTimeAsync(100);
      expect(postedFor(ids)).toEqual(expected);
      expect(sending).toHaveLength(1);
    }

    /** Lets the hold run out. */
    async function endHold(): Promise<void> {
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_MS);
    }

    /** Lands the post still sending. */
    function land(): void {
      sending.shift()!.land();
    }

    /**
     * Holds the webhook with a 429 on the first draft's start, then starts
     * the rest of `ids`, in order, while it is held.
     */
    async function startWhileHeld(ids: string[]): Promise<void> {
      webhookClient.post.mockRejectedValueOnce(
        new WebhookRateLimitedError(RATE_LIMIT_MS),
      );
      for (const id of ids) {
        await start(id).expect(200);
        await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());
      }
    }

    it('posts the waiting posts one at a time, in the order they started waiting', async () => {
      const ids = [
        await draftOnWebhook(),
        await draftOnWebhook(),
        await draftOnWebhook(),
      ];
      const [first, second, third] = ids;
      await startWhileHeld(ids);
      expect(postedFor(ids)).toEqual([first]);

      await endHold();
      await expectPostedFor(ids, [first, first]);
      land();
      await expectPostedFor(ids, [first, first, second]);
      land();
      await expectPostedFor(ids, [first, first, second, third]);
      land();
      await announcementsSettled(third);
    });

    it('posts a post that arrives while they go after them', async () => {
      const ids = [await draftOnWebhook(), await draftOnWebhook()];
      const late = await draftOnWebhook();
      const [first, second] = ids;
      const all = [...ids, late];
      await startWhileHeld(ids);
      await endHold();
      await expectPostedFor(all, [first, first]);

      await start(late).expect(200);
      await expectPostedFor(all, [first, first]);
      land();
      await expectPostedFor(all, [first, first, second]);
      land();
      await expectPostedFor(all, [first, first, second, late]);
      land();
      await announcementsSettled(late);
    });

    it('holds the webhook again when Discord rate limits one of them', async () => {
      const ids = [
        await draftOnWebhook(),
        await draftOnWebhook(),
        await draftOnWebhook(),
      ];
      const [first, second, third] = ids;
      await startWhileHeld(ids);
      await endHold();
      await expectPostedFor(ids, [first, first]);
      land();
      await expectPostedFor(ids, [first, first, second]);

      sending.shift()!.fail(new WebhookRateLimitedError(RATE_LIMIT_MS));
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_MS - SLACK_MS);
      expect(postedFor(ids)).toEqual([first, first, second]);
      await vi.advanceTimersByTimeAsync(SLACK_MS);
      await expectPostedFor(ids, [first, first, second, second]);
      land();
      await expectPostedFor(ids, [first, first, second, second, third]);
      land();
      await announcementsSettled(third);
    });

    it('keeps each draft’s posts in order', async () => {
      const ids = [await draftOnWebhook(), await draftOnWebhook()];
      const [first, second] = ids;
      const shock = (await poolCardIds(first)).Shock;
      await startWhileHeld(ids);
      await pick(first, shock).expect(200);
      await endHold();

      await expectPostedFor(ids, [first, first]);
      land();
      await expectPostedFor(ids, [first, first, second]);
      land();
      await expectPostedFor(ids, [first, first, second, first]);
      land();
      await announcementsSettled(first);
      const contents = webhookClient.post.mock.calls.map(
        ([, { content }]) => content,
      );
      expect(contents[1]).toContain('has started');
      expect(contents[3]).not.toContain('has started');
    });
  });
});
