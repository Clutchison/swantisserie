import { Logger } from '@nestjs/common';
import {
  DraftNotifier,
  SHUTDOWN_DEADLINE_MS,
} from '../../discord/draft-notifier.js';
import {
  aliceCookie,
  app,
  bob,
  useDraftsApp,
  slowDownDatabase,
  slowQueryUnderway,
  readyDraft,
  getDraft,
  pick,
  poolCardIds,
  registerWebhook,
  signIn,
  start,
  webhookClient,
  webhookUrl,
} from './harness.js';

useDraftsApp();

describe('shutting down', () => {
  it('lets a request still reading the database finish first', async () => {
    const errors = vi.spyOn(Logger.prototype, 'error');
    const id = await readyDraft([aliceCookie]);
    slowDownDatabase(50);
    const reading = slowQueryUnderway();

    // `then` sends the request now, rather than when it is awaited.
    const read = getDraft(id).then((res) => res);
    // Before #294, closing while this request's queries were under way hung
    // for good.
    await reading;
    await app.close();

    expect((await read).status).toBe(200);
    expect(errors).not.toHaveBeenCalled();
  });

  describe('with announcements', () => {
    let id: string;

    beforeEach(async () => {
      id = await readyDraft(
        [aliceCookie, await signIn(bob)],
        1,
        undefined,
        await registerWebhook(),
      );
    });

    /** A post that takes 100 ms, and whether it has finished. */
    function slowPost() {
      const post = { finished: false };
      const send = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        post.finished = true;
      };
      return { post, send };
    }

    it('finishes an announcement still being retried', async () => {
      const errors = vi.spyOn(Logger.prototype, 'error');
      const { post, send } = slowPost();
      webhookClient.post
        .mockRejectedValueOnce(new Error('Discord is down'))
        .mockImplementationOnce(send);
      await start(id).expect(200);
      await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

      await app.close();

      expect(post.finished).toBe(true);
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      expect(errors).not.toHaveBeenCalled();
    });

    it('posts the announcement of a request that finishes as the server closes', async () => {
      const errors = vi.spyOn(Logger.prototype, 'error');
      await start(id).expect(200);
      const shock = (await poolCardIds(id)).Shock;
      await vi.waitFor(() =>
        expect(webhookClient.post).toHaveBeenCalledTimes(1),
      );
      const { post, send } = slowPost();
      webhookClient.post.mockImplementationOnce(send);
      slowDownDatabase(50);
      const picking = slowQueryUnderway();

      // `then` sends the request now, rather than when it is awaited.
      const picked = pick(id, shock).then((res) => res);
      await picking;
      await app.close();

      expect((await picked).status).toBe(200);
      expect(post.finished).toBe(true);
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      expect(webhookClient.post).toHaveBeenLastCalledWith(
        webhookUrl,
        expect.anything(),
      );
      expect(errors).not.toHaveBeenCalled();
    });

    describe('past the shutdown deadline', () => {
      beforeEach(() => {
        vi.useFakeTimers({
          toFake: ['setTimeout', 'clearTimeout', 'Date'],
          shouldAdvanceTime: true,
        });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      /** A post that doesn't fail until the function this returns is called. */
      function holdPost(): () => void {
        let fail!: (err: Error) => void;
        webhookClient.post.mockImplementationOnce(
          () =>
            new Promise<void>((_, reject) => {
              fail = reject;
            }),
        );
        return () => fail(new Error('Discord is down'));
      }

      /** Closes the app, jumping past the deadline once shutdown waits. */
      async function closePastDeadline() {
        let closed = false;
        const closing = app.close().then(() => {
          closed = true;
        });
        await vi.advanceTimersByTimeAsync(SHUTDOWN_DEADLINE_MS);
        await closing;
        return closed;
      }

      it('stops waiting for an announcement that never finishes and logs it dropped', async () => {
        const errors = vi.spyOn(Logger.prototype, 'error');
        holdPost();
        await start(id).expect(200);
        await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

        expect(await closePastDeadline()).toBe(true);

        expect(errors).toHaveBeenCalledTimes(1);
        expect(errors).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`dropped.*draft ${id}`)),
        );
      });

      it('starts no new post after the deadline', async () => {
        const errors = vi.spyOn(Logger.prototype, 'error');
        const fail = holdPost();
        await start(id).expect(200);
        await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());
        void app.get(DraftNotifier).notify(id, [{ type: 'frozen' }]);

        await closePastDeadline();
        // A retry would be a new post.
        fail();
        await vi.advanceTimersByTimeAsync(1000);

        expect(webhookClient.post).toHaveBeenCalledTimes(1);
        // The start still sending and the freeze still queued.
        expect(errors).toHaveBeenCalledTimes(2);
      });

      it('drops and logs an announcement notified after the deadline', async () => {
        const errors = vi.spyOn(Logger.prototype, 'error');
        holdPost();
        await start(id).expect(200);
        await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());
        await closePastDeadline();
        errors.mockClear();

        await app.get(DraftNotifier).notify(id, [{ type: 'frozen' }]);

        expect(webhookClient.post).toHaveBeenCalledTimes(1);
        expect(errors).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`dropped.*draft ${id}.*frozen`)),
        );
      });
    });

    it('posts an announcement queued while it waits for the others', async () => {
      const errors = vi.spyOn(Logger.prototype, 'error');
      const notifier = app.get(DraftNotifier);
      let hookStarted!: () => void;
      const waiting = new Promise<void>((resolve) => {
        hookStarted = resolve;
      });
      const hook = notifier.onApplicationShutdown.bind(notifier);
      vi.spyOn(notifier, 'onApplicationShutdown').mockImplementation(() => {
        hookStarted();
        return hook();
      });
      // The start's post queues a freeze once shutdown is waiting on it.
      webhookClient.post.mockImplementationOnce(async () => {
        await waiting;
        void notifier.notify(id, [{ type: 'frozen' }]);
      });
      await start(id).expect(200);
      await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

      await app.close();

      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      expect(errors).not.toHaveBeenCalled();
    });
  });
});
