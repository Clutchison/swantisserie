import { Logger } from '@nestjs/common';
import request from 'supertest';
import { DraftNotifier } from '../../discord/draft-notifier.js';
import {
  aliceCookie,
  app,
  bob,
  carol,
  useDraftsApp,
  slowDownDatabase,
  readyDraft,
  getDraft,
  pick,
  poolCardIds,
  signIn,
  start,
  webhookClient,
} from './harness.js';

useDraftsApp();

describe('shutting down', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a request still reading the database finish first', async () => {
    const errors = vi.spyOn(Logger.prototype, 'error');
    const id = await readyDraft([aliceCookie]);
    slowDownDatabase(50);

    // `then` sends the request now, rather than when it is awaited.
    const read = getDraft(id).then((res) => res);
    // Before #294, closing 200 ms into this read hung for good.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await app.close();

    expect((await read).status).toBe(200);
    expect(errors).not.toHaveBeenCalled();
  });

  describe('with announcements', () => {
    const webhookUrl = 'https://discord.com/api/webhooks/1234567890/token';
    let id: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({ name: '#roto-main', url: webhookUrl })
        .expect(201);
      id = await readyDraft(
        [aliceCookie, await signIn(bob)],
        1,
        undefined,
        res.body.id,
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

      // `then` sends the request now, rather than when it is awaited.
      const picked = pick(id, shock).then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 200));
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
      // The start's post queues a pause once shutdown is waiting on it.
      webhookClient.post.mockImplementationOnce(async () => {
        await waiting;
        void notifier.notify(id, [{ type: 'paused' }]);
      });
      await start(id).expect(200);
      await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalled());

      await app.close();

      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      expect(errors).not.toHaveBeenCalled();
    });
  });
});
