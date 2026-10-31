import { Logger } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ScryfallSearchPage,
  ScryfallUnavailableError,
} from '../../scryfall/scryfall-client.js';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  scryfall,
  webhookClient,
  useDraftsApp,
  startApp,
  signIn,
  scryfallAnswers,
  page,
  snapshotQuery,
  createDraft,
  listDrafts,
  getDraft,
  snapshotted,
  readyDraft,
  start,
} from './harness.js';

useDraftsApp();

describe('cancel', () => {
  function cancel(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .delete(`/api/drafts/${id}`)
      .set('Cookie', cookie);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels a lobby draft, so its link is not found and the list omits it', async () => {
    const id = await readyDraft([aliceCookie]);

    await cancel(id).expect(204);

    await getDraft(id).expect(404);
    expect((await listDrafts().expect(200)).body).toEqual([]);
  });

  it('leaves nothing belonging to the draft, including its bots', async () => {
    const id = await readyDraft([aliceCookie]);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/queue`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/bots`)
      .set('Cookie', await signIn(carol))
      .expect(201);

    await cancel(id).expect(204);

    const prisma = app.get(PrismaService);
    expect(await prisma.poolCard.count()).toBe(0);
    expect(await prisma.player.count()).toBe(0);
    expect(await prisma.queuedCard.count()).toBe(0);
    expect(await prisma.user.count({ where: { isBot: true } })).toBe(0);
    expect(await prisma.user.count({ where: { id: alice.id } })).toBe(1);
  });

  it('lets an app admin cancel, but not other role-holders', async () => {
    const id = await readyDraft([aliceCookie]);

    await cancel(id, await signIn(bob)).expect(403);
    await getDraft(id).expect(200);

    await cancel(id, await signIn(carol)).expect(204);
  });

  it('answers 404 for a draft that does not exist', async () => {
    await cancel('no-such-draft').expect(404);
  });

  it('refuses to cancel a draft that has left the lobby', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    await start(id).expect(200);

    const refused = await cancel(id).expect(409);

    expect(refused.body).toEqual({
      error: 'draft-started',
      message: 'This draft has started.',
    });
    await getDraft(id).expect(200);
  });

  it('cancels a draft whose snapshot failed', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
    await snapshotted(created.body.id);

    await cancel(created.body.id).expect(204);

    await getDraft(created.body.id).expect(404);
  });

  /**
   * A draft whose snapshot is waiting on Scryfall for page 2, having saved
   * page 1. `answer` settles that wait.
   */
  async function draftWithRunningSnapshot() {
    const query = snapshotQuery('c:r');
    let answer!: {
      resolve: (page: ScryfallSearchPage) => void;
      reject: (err: Error) => void;
    };
    const pageTwo = new Promise<ScryfallSearchPage>((resolve, reject) => {
      answer = { resolve, reject };
    });
    scryfall.search.mockImplementation(async (searched, number = 1) => {
      if (searched !== query) {
        return searched === 'c:r' ? page('Shock') : null;
      }
      if (number === 1) {
        return { ...page('Shock'), totalCards: 2, hasMore: true };
      }
      return pageTwo;
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
    await vi.waitFor(() =>
      expect(scryfall.search).toHaveBeenCalledWith(query, 2),
    );
    return { id: created.body.id as string, answer };
  }

  it('stops a running snapshot cleanly when its next page arrives', async () => {
    const { id, answer } = await draftWithRunningSnapshot();
    const errors = vi.spyOn(Logger.prototype, 'error');

    await cancel(id).expect(204);
    answer.resolve(page('Lightning Bolt'));
    // Shutting down waits for the snapshot to end.
    await app.close();

    expect(errors).not.toHaveBeenCalled();
    await startApp();
    await getDraft(id).expect(404);
    expect(await app.get(PrismaService).poolCard.count()).toBe(0);
  });

  it('stops a running snapshot cleanly when Scryfall then fails', async () => {
    const { id, answer } = await draftWithRunningSnapshot();
    const errors = vi.spyOn(Logger.prototype, 'error');

    await cancel(id).expect(204);
    answer.reject(new ScryfallUnavailableError(503));
    await app.close();

    expect(errors).not.toHaveBeenCalled();
    await startApp();
    expect(scryfall.search).toHaveBeenCalledTimes(4);
  });

  it('posts no announcement', async () => {
    const { body: webhook } = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .set('Cookie', await signIn(carol))
      .send({
        name: '#roto-main',
        url: 'https://discord.com/api/webhooks/1234567890/secret-token',
      })
      .expect(201);
    const id = await readyDraft([aliceCookie], 1, undefined, webhook.id);

    await cancel(id).expect(204);

    // Announcing isn't awaited, so give a stray post time to be made.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(webhookClient.post).not.toHaveBeenCalled();
  });

  it('answers one of two cancels at once with 404, not a conflict', async () => {
    const id = await readyDraft([aliceCookie]);
    const carolCookie = await signIn(carol);

    const answers = await Promise.all([cancel(id), cancel(id, carolCookie)]);

    expect(answers.map((res) => res.status)).toEqual(
      expect.arrayContaining([204, 404]),
    );
  });
});
