import request from 'supertest';
import {
  carol,
  app,
  scryfall,
  useDraftsApp,
  signIn,
  allOnArena,
  createDraft,
  listDrafts,
  getDraft,
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
});
