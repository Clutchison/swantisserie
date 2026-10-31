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

const pageUrl = 'https://swantisserie.example/drafts/42';

describe('sending feedback', () => {
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

  function send(body: object, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post('/api/feedback')
      .set('Cookie', cookie)
      .send(body);
  }

  /** No API reads feedback yet, so tests look at what was saved directly. */
  const saved = () => app.get(PrismaService).feedback.findMany();

  it('saves the sender, time sent and page URL, starting unreviewed', async () => {
    const before = Date.now();

    await send({ message: 'The pool tab is great', pageUrl }).expect(204);

    const [feedback, ...others] = await saved();
    expect(others).toEqual([]);
    expect(feedback).toMatchObject({
      message: 'The pool tab is great',
      senderId: alice.id,
      pageUrl,
      reviewed: false,
    });
    expect(feedback.sentAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(feedback.sentAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('accepts feedback from app admins too', async () => {
    await send({ message: 'Hello', pageUrl }, carolCookie).expect(204);

    expect((await saved())[0].senderId).toBe(carol.id);
  });

  it('rejects anyone not signed in', async () => {
    await request(app.getHttpServer())
      .post('/api/feedback')
      .send({ message: 'Hello', pageUrl })
      .expect(401);

    expect(await saved()).toEqual([]);
  });

  it.each([
    ['missing', undefined],
    ['not text', 42],
    ['empty', ''],
    ['only whitespace', ' \n\t '],
    ['over 2,000 characters', 'x'.repeat(2001)],
  ])('rejects a message that is %s', async (_, message) => {
    const res = await send({ message, pageUrl }).expect(400);

    expect(res.body).toMatchObject({ error: 'invalid' });
    expect(await saved()).toEqual([]);
  });

  it('accepts a message of exactly 2,000 characters', async () => {
    const message = 'x'.repeat(2000);

    await send({ message, pageUrl }).expect(204);

    expect((await saved())[0].message).toBe(message);
  });

  it('counts and saves the message without its surrounding whitespace', async () => {
    await send({ message: `  ${'x'.repeat(2000)}\n`, pageUrl }).expect(204);

    expect((await saved())[0].message).toBe('x'.repeat(2000));
  });

  it.each([
    ['missing', undefined],
    ['not a URL', 'somewhere'],
    ['not a web page', 'javascript:alert(1)'],
    ['absurdly long', `https://example.com/${'x'.repeat(2048)}`],
  ])('rejects a page URL that is %s', async (_, url) => {
    await send({ message: 'Hello', pageUrl: url }).expect(400);

    expect(await saved()).toEqual([]);
  });
});
