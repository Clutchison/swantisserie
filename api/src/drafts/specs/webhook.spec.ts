import request from 'supertest';
import { DraftNotifier } from '../../discord/draft-notifier.js';
import {
  aliceCookie,
  bob,
  carol,
  app,
  scryfall,
  useDraftsApp,
  signIn,
  allOnArena,
  createDraft,
  listDrafts,
  getDraft,
  pick,
  post,
  readyDraft,
  start,
  webhookClient,
} from './harness.js';

useDraftsApp();

describe('webhook', () => {
  const webhookUrl = 'https://discord.com/api/webhooks/1234567890/secret-token';
  let carolCookie: string;
  let webhookId: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
    const res = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .set('Cookie', carolCookie)
      .send({ name: '#roto-main', url: webhookUrl })
      .expect(201);
    webhookId = res.body.id;
    allOnArena('t:dragon c:r');
  });

  it('posts to the webhook the organizer chose, shown by name only', async () => {
    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      webhookId,
    }).expect(201);

    const webhook = { id: webhookId, name: '#roto-main' };
    expect(created.body.webhook).toEqual(webhook);
    const shown = await getDraft(created.body.id).expect(200);
    expect(shown.body.webhook).toEqual(webhook);
    const listed = await listDrafts().expect(200);
    expect(listed.body[0].webhook).toEqual(webhook);
    for (const res of [created, shown, listed]) {
      expect(res.text).not.toContain('secret-token');
    }
  });

  it('posts nowhere when the organizer chose no webhook', async () => {
    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      webhookId: null,
    }).expect(201);

    expect(created.body.webhook).toBeNull();
  });

  it('refuses a webhook that does not exist', async () => {
    const res = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      webhookId: 'no-such-webhook',
    }).expect(400);

    expect(res.body).toEqual({
      error: 'invalid',
      message: 'That webhook has been removed. Choose another.',
    });
    expect(scryfall.search).not.toHaveBeenCalled();
    await listDrafts().expect(200).expect([]);
  });

  it('shows a webhook’s new name, and posts nowhere once it is removed', async () => {
    const { body } = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      webhookId,
    }).expect(201);

    await request(app.getHttpServer())
      .patch(`/api/admin/webhooks/${webhookId}`)
      .set('Cookie', carolCookie)
      .send({ name: '#roto-league' })
      .expect(200);
    expect((await getDraft(body.id).expect(200)).body.webhook).toEqual({
      id: webhookId,
      name: '#roto-league',
    });

    await request(app.getHttpServer())
      .delete(`/api/admin/webhooks/${webhookId}`)
      .set('Cookie', carolCookie)
      .expect(204);
    expect((await getDraft(body.id).expect(200)).body.webhook).toBeNull();
  });

  describe('changing it', () => {
    const otherUrl = 'https://discord.com/api/webhooks/987/other-secret';
    let bobCookie: string;
    let otherId: string;

    beforeEach(async () => {
      bobCookie = await signIn(bob);
      const res = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', carolCookie)
        .send({ name: '#roto-other', url: otherUrl })
        .expect(201);
      otherId = res.body.id;
    });

    function changeWebhook(
      id: string,
      body: object,
      cookie: string = aliceCookie,
    ) {
      return request(app.getHttpServer())
        .put(`/api/drafts/${id}/webhook`)
        .set('Cookie', cookie)
        .send(body);
    }

    function removeWebhook(id: string) {
      return request(app.getHttpServer())
        .delete(`/api/admin/webhooks/${id}`)
        .set('Cookie', carolCookie)
        .expect(204);
    }

    /** The webhook URL of each post, once `count` have been made. */
    async function postedTo(count: number) {
      return vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(count);
        return webhookClient.post.mock.calls.map(([url]) => url);
      });
    }

    /** A draft Alice and Bob have joined, posting to the first webhook. */
    const joinedDraft = () =>
      readyDraft([aliceCookie, bobCookie], 1, undefined, webhookId);

    /** Moves a joined draft to `state`, by the routes players use. */
    async function moveTo(id: string, state: string) {
      if (state === 'Lobby') return;
      await start(id).expect(200);
      if (state === 'Paused') await post(id, 'pause').expect(200);
      if (state === 'Closed') await post(id, 'close').expect(200);
      if (state === 'Complete') {
        await pick(id, 'shock-oracle').expect(200);
        await pick(id, 'lava-spike-oracle', bobCookie).expect(200);
      }
    }

    it.each(['Lobby', 'Drafting', 'Paused', 'Closed', 'Complete'])(
      'lets the organizer change it on a draft in %s, shown by name only',
      async (state) => {
        const id = await joinedDraft();
        await moveTo(id, state);

        const res = await changeWebhook(id, { webhookId: otherId }).expect(200);

        expect(res.body.state).toBe(state);
        expect(res.body.webhook).toEqual({
          id: otherId,
          name: '#roto-other',
        });
        expect(res.text).not.toContain('other-secret');
        expect((await getDraft(id).expect(200)).body.webhook).toEqual(
          res.body.webhook,
        );
      },
    );

    it('lets an app admin change it, and refuses anyone else', async () => {
      const id = await joinedDraft();

      await changeWebhook(id, { webhookId: otherId }, bobCookie).expect(403);
      expect((await getDraft(id).expect(200)).body.webhook.id).toBe(webhookId);

      const res = await changeWebhook(
        id,
        { webhookId: otherId },
        carolCookie,
      ).expect(200);
      expect(res.body.webhook.id).toBe(otherId);
    });

    it('refuses a body that names no choice, and a draft that doesn’t exist', async () => {
      const id = await joinedDraft();

      await changeWebhook(id, {}).expect(400);
      await changeWebhook(id, { webhookId: 7 }).expect(400);
      await changeWebhook('no-such-draft', { webhookId: otherId }).expect(404);
      expect((await getDraft(id).expect(200)).body.webhook.id).toBe(webhookId);
    });

    it('posts later announcements to the new webhook, and nothing for the change', async () => {
      const id = await joinedDraft();
      await start(id).expect(200);
      expect(await postedTo(1)).toEqual([webhookUrl]);

      await changeWebhook(id, { webhookId: otherId }).expect(200);
      await post(id, 'pause').expect(200);

      expect(await postedTo(2)).toEqual([webhookUrl, otherUrl]);
    });

    it('posts nothing once none is chosen', async () => {
      const id = await joinedDraft();

      const res = await changeWebhook(id, { webhookId: null }).expect(200);
      expect(res.body.webhook).toBeNull();
      await start(id).expect(200);
      await pick(id, 'shock-oracle').expect(200);
      await pick(id, 'lava-spike-oracle', bobCookie).expect(200);

      // Waits behind the draft's announcements, so they have had their chance.
      await app.get(DraftNotifier).notify(id, []);
      expect(webhookClient.post).not.toHaveBeenCalled();
    });

    it('resends no announcement missed before the change', async () => {
      const id = await readyDraft([aliceCookie, bobCookie]);
      await start(id).expect(200);

      await changeWebhook(id, { webhookId }).expect(200);
      await post(id, 'pause').expect(200);

      expect(await postedTo(1)).toEqual([webhookUrl]);
    });

    it('refuses a webhook just removed, leaving the draft’s unchanged', async () => {
      const id = await joinedDraft();
      await removeWebhook(otherId);

      const res = await changeWebhook(id, { webhookId: otherId }).expect(409);

      expect(res.body).toEqual({
        error: 'webhook-removed',
        message: 'That webhook has been removed. Choose another.',
      });
      expect((await getDraft(id).expect(200)).body.webhook.id).toBe(webhookId);
    });

    it('gives a draft whose webhook was removed a new one', async () => {
      const id = await joinedDraft();
      await removeWebhook(webhookId);
      expect((await getDraft(id).expect(200)).body.webhook).toBeNull();

      const res = await changeWebhook(id, { webhookId: otherId }).expect(200);

      expect(res.body.webhook.id).toBe(otherId);
    });

    it('finishes a post already sending on the old webhook, and sends queued ones to the new', async () => {
      const id = await joinedDraft();
      let release = () => {};
      webhookClient.post.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      await start(id).expect(200);
      expect(await postedTo(1)).toEqual([webhookUrl]);

      await post(id, 'pause').expect(200);
      await changeWebhook(id, { webhookId: otherId }).expect(200);
      release();

      expect(await postedTo(2)).toEqual([webhookUrl, otherUrl]);
    });
  });
});
