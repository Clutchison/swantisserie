import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { AdminConfig } from '../auth/admin-config.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, TestDatabase } from '../testing/test-database.js';

const alice = { id: '80351110224678912', name: 'Alice' };
const carol = { id: '80351110224678914', name: 'Carol' };
/** Carol is an app admin. */
const admins = new AdminConfig(carol.id);

const mainUrl =
  'https://discord.com/api/webhooks/1234567890/main-token_ABC-xyz';
const sideUrl = 'https://discord.com/api/webhooks/1234567891/side-token';

describe('webhook registry', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let aliceCookie: string;
  let carolCookie: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
  });

  afterAll(async () => {
    await database.stop();
  });

  /** Signing in through Discord is covered by the auth tests. */
  async function signIn(user: { id: string; name: string }) {
    await app.get(PrismaService).user.create({ data: user });
    const { token } = await app.get(SessionService).create(user.id);
    return `session=${token}`;
  }

  beforeEach(async () => {
    await database.reset();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register({ webRoot: import.meta.dirname })],
    })
      .overrideProvider(AdminConfig)
      .useValue(admins)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    aliceCookie = await signIn(alice);
    carolCookie = await signIn(carol);
  });

  afterEach(async () => {
    await app.close();
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
    });
    const list = await adminList().expect(200);
    expect(list.body).toEqual([
      { id: expect.any(String), name: '#roto-main', url: mainUrl },
      { id: added.body.id, name: '#roto-side', url: sideUrl },
    ]);
  });

  it('refuses the registry to role-holders who are not app admins', async () => {
    await addWebhook({ name: '#roto-main', url: mainUrl }).expect(201);

    await adminList(aliceCookie).expect(403);
    await addWebhook({ name: '#roto-side', url: sideUrl }, aliceCookie).expect(
      403,
    );
    const { id } = (await adminList().expect(200)).body[0];
    await rename(id, { name: '#renamed' }, aliceCookie).expect(403);
    await remove(id, aliceCookie).expect(403);
    await http().get('/api/admin/webhooks').expect(401);
    expect((await adminList().expect(200)).body).toEqual([
      { id, name: '#roto-main', url: mainUrl },
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
    await addWebhook({ name: '#roto-main', url: mainUrl }).expect(201);

    const res = await addWebhook({ name: '#roto-main', url: sideUrl }).expect(
      409,
    );

    expect(res.body).toEqual({
      error: 'name-taken',
      message: 'Another webhook is called #roto-main.',
    });
  });

  it('lists webhooks to every role-holder by name, without their URLs', async () => {
    await addWebhook({ name: '#roto-main', url: mainUrl }).expect(201);

    for (const cookie of [aliceCookie, carolCookie]) {
      const res = await http()
        .get('/api/webhooks')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([
        { id: expect.any(String), name: '#roto-main' },
      ]);
      expect(res.text).not.toContain('main-token');
    }
    await http().get('/api/webhooks').expect(401);
  });

  describe('rename and remove', () => {
    let mainId: string;

    beforeEach(async () => {
      mainId = (await addWebhook({ name: '#roto-main', url: mainUrl })).body.id;
    });

    it('renames a webhook, keeping its URL', async () => {
      const res = await rename(mainId, { name: ' #roto-league ' }).expect(200);

      const renamed = { id: mainId, name: '#roto-league', url: mainUrl };
      expect(res.body).toEqual(renamed);
      expect((await adminList().expect(200)).body).toEqual([renamed]);
    });

    it('refuses a blank name, or one another webhook has', async () => {
      await addWebhook({ name: '#roto-side', url: sideUrl }).expect(201);

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

    it('removes a webhook', async () => {
      await remove(mainId).expect(204);

      expect((await adminList().expect(200)).body).toEqual([]);
    });

    it('is 404 for a webhook that does not exist', async () => {
      await remove(mainId).expect(204);

      await rename(mainId, { name: '#renamed' }).expect(404);
      await remove(mainId).expect(404);
    });
  });
});
