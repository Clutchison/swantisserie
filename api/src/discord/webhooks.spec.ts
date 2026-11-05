import request from 'supertest';
import {
  alice,
  app,
  carol,
  registerWebhook,
  signIn,
  useTestApp,
} from '../testing/app.js';

const mainUrl =
  'https://discord.com/api/webhooks/1234567890/main-token_ABC-xyz';
const sideUrl = 'https://discord.com/api/webhooks/1234567891/side-token';

describe('webhook registry', () => {
  let aliceCookie: string;
  let carolCookie: string;

  useTestApp();

  beforeEach(async () => {
    aliceCookie = await signIn(alice);
    carolCookie = await signIn(carol);
  });

  const http = () => request(app.getHttpServer());

  function addWebhook(body: object, cookie = carolCookie) {
    return http().post('/api/admin/webhooks').set('Cookie', cookie).send(body);
  }

  function adminList(cookie = carolCookie) {
    return http().get('/api/admin/webhooks').set('Cookie', cookie);
  }

  function rename(id: string, body: object, cookie = carolCookie) {
    return http()
      .patch(`/api/admin/webhooks/${id}`)
      .set('Cookie', cookie)
      .send(body);
  }

  function replaceUrl(id: string, body: object, cookie = carolCookie) {
    return http()
      .put(`/api/admin/webhooks/${id}/url`)
      .set('Cookie', cookie)
      .send(body);
  }

  function remove(id: string, cookie = carolCookie) {
    return http().delete(`/api/admin/webhooks/${id}`).set('Cookie', cookie);
  }

  it('lets an app admin add named webhooks, listed by name with their URLs', async () => {
    const added = await addWebhook({ name: '#roto-side', url: sideUrl }).expect(
      201,
    );
    await addWebhook({ name: '#roto-main', url: mainUrl }).expect(201);

    expect(added.body).toEqual({
      id: expect.any(String),
      name: '#roto-side',
      url: sideUrl,
      gone: false,
    });
    const list = await adminList().expect(200);
    expect(list.body).toEqual([
      { id: expect.any(String), name: '#roto-main', url: mainUrl, gone: false },
      { id: added.body.id, name: '#roto-side', url: sideUrl, gone: false },
    ]);
  });

  it('refuses the registry to guild members who are not app admins', async () => {
    await registerWebhook('#roto-main', mainUrl);

    await adminList(aliceCookie).expect(403);
    await addWebhook({ name: '#roto-side', url: sideUrl }, aliceCookie).expect(
      403,
    );
    const { id } = (await adminList().expect(200)).body[0];
    await rename(id, { name: '#renamed' }, aliceCookie).expect(403);
    await replaceUrl(id, { url: sideUrl }, aliceCookie).expect(403);
    await remove(id, aliceCookie).expect(403);
    await http().get('/api/admin/webhooks').expect(401);
    expect((await adminList().expect(200)).body).toEqual([
      { id, name: '#roto-main', url: mainUrl, gone: false },
    ]);
  });

  it.each([
    [{ url: mainUrl }, 'Give the webhook a name.'],
    [{ name: '   ', url: mainUrl }, 'Give the webhook a name.'],
    [
      { name: 'x'.repeat(101), url: mainUrl },
      'Keep the name to 100 characters.',
    ],
    [{ name: '#roto-main' }, 'Paste the webhook’s URL from Discord.'],
    [
      { name: '#roto-main', url: 'https://example.com/api/webhooks/1/abc' },
      'Paste the webhook’s URL from Discord.',
    ],
  ])('refuses %j', async (body, message) => {
    const res = await addWebhook(body).expect(400);

    expect(res.body).toEqual({ error: 'invalid', message });
    expect((await adminList().expect(200)).body).toEqual([]);
  });

  it('trims the name and URL', async () => {
    const res = await addWebhook({
      name: '  #roto-main ',
      url: ` ${mainUrl}  `,
    }).expect(201);

    expect(res.body).toMatchObject({ name: '#roto-main', url: mainUrl });
  });

  it('refuses a name another webhook has', async () => {
    await registerWebhook('#roto-main', mainUrl);

    const res = await addWebhook({ name: '#roto-main', url: sideUrl }).expect(
      409,
    );

    expect(res.body).toEqual({
      error: 'name-taken',
      message: 'Another webhook is called #roto-main.',
    });
  });

  it('lists webhooks to every guild member by name, without their URLs', async () => {
    await registerWebhook('#roto-main', mainUrl);

    for (const cookie of [aliceCookie, carolCookie]) {
      const res = await http()
        .get('/api/webhooks')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([
        { id: expect.any(String), name: '#roto-main', gone: false },
      ]);
      expect(res.text).not.toContain('main-token');
    }
    await http().get('/api/webhooks').expect(401);
  });

  describe('rename, replace URL and remove', () => {
    let mainId: string;

    beforeEach(async () => {
      mainId = await registerWebhook('#roto-main', mainUrl);
    });

    it('renames a webhook, keeping its URL', async () => {
      const res = await rename(mainId, { name: ' #roto-league ' }).expect(200);

      const renamed = {
        id: mainId,
        name: '#roto-league',
        url: mainUrl,
        gone: false,
      };
      expect(res.body).toEqual(renamed);
      expect((await adminList().expect(200)).body).toEqual([renamed]);
    });

    it('refuses a blank name, or one another webhook has', async () => {
      await registerWebhook('#roto-side', sideUrl);

      const blank = await rename(mainId, { name: ' ' }).expect(400);
      expect(blank.body).toEqual({
        error: 'invalid',
        message: 'Give the webhook a name.',
      });
      const taken = await rename(mainId, { name: '#roto-side' }).expect(409);
      expect(taken.body).toEqual({
        error: 'name-taken',
        message: 'Another webhook is called #roto-side.',
      });
    });

    it('replaces a webhook’s URL, trimmed, keeping its name', async () => {
      const res = await replaceUrl(mainId, { url: ` ${sideUrl} ` }).expect(200);

      const replaced = {
        id: mainId,
        name: '#roto-main',
        url: sideUrl,
        gone: false,
      };
      expect(res.body).toEqual(replaced);
      expect((await adminList().expect(200)).body).toEqual([replaced]);
    });

    it.each<[string, object]>([
      [
        'a URL that isn’t a Discord webhook’s',
        { url: 'https://example.com/x' },
      ],
      ['a blank URL', { url: ' ' }],
      ['no URL', {}],
    ])('refuses %s, keeping the old one', async (_, body) => {
      const res = await replaceUrl(mainId, body).expect(400);

      expect(res.body).toEqual({
        error: 'invalid',
        message: 'Paste the webhook’s URL from Discord.',
      });
      expect((await adminList().expect(200)).body[0].url).toBe(mainUrl);
    });

    it('removes a webhook', async () => {
      await remove(mainId).expect(204);

      expect((await adminList().expect(200)).body).toEqual([]);
    });

    it('is 404 for a webhook that does not exist', async () => {
      await remove(mainId).expect(204);

      await rename(mainId, { name: '#renamed' }).expect(404);
      await replaceUrl(mainId, { url: sideUrl }).expect(404);
      await remove(mainId).expect(404);
    });
  });
});
