import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { startTestDatabase, TestDatabase } from '../testing/test-database.js';
import { DiscordClient, DiscordProfile } from './discord-client.js';
import { DiscordConfig } from './discord-config.js';

const config: DiscordConfig = {
  clientId: 'client-123',
  clientSecret: 'shh',
  redirectUri: 'http://localhost:4200/api/auth/discord/callback',
};

describe('Discord sign-in', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  const discord = {
    exchangeCode: vi.fn<DiscordClient['exchangeCode']>(),
    getCurrentUser: vi.fn<DiscordClient['getCurrentUser']>(),
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
  });

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.reset();
    vi.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register({ webRoot: import.meta.dirname })],
    })
      .overrideProvider(DiscordConfig)
      .useValue(config)
      .overrideProvider(DiscordClient)
      .useValue(discord)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends the user to Discord with a state that is also set as a cookie', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/discord')
      .expect(302);

    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(
      'https://discord.com/oauth2/authorize',
    );
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('client_id')).toBe('client-123');
    expect(location.searchParams.get('scope')).toBe(
      'identify guilds.members.read',
    );
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4200/api/auth/discord/callback',
    );
    const state = location.searchParams.get('state');
    expect(state).toMatch(/^[\w-]{20,}$/);
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(`^oauth_state=${state};`)]),
    );
  });

  /** Runs the redirect → callback round trip in a cookie-keeping agent. */
  async function signIn(profile: DiscordProfile) {
    discord.exchangeCode.mockResolvedValue('access-token');
    discord.getCurrentUser.mockResolvedValue(profile);
    const agent = request.agent(app.getHttpServer());
    const start = await agent.get('/api/auth/discord');
    const state = new URL(start.headers.location).searchParams.get('state');
    const callback = await agent
      .get('/api/auth/discord/callback')
      .query({ code: 'auth-code', state });
    return { agent, callback };
  }

  /** `session=<token>`, ready for a Cookie header. */
  function sessionCookieFrom(res: request.Response): string {
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return cookies.find((c) => c.startsWith('session='))!.split(';')[0];
  }

  const alice: DiscordProfile = {
    id: '80351110224678912',
    username: 'alice',
    global_name: 'Alice',
    avatar: '8342729096ea3675442027381ff50dfe',
  };

  it('signs the user in on callback and reports them from /me', async () => {
    const { agent, callback } = await signIn(alice);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/');
    expect(discord.exchangeCode).toHaveBeenCalledWith('auth-code');
    expect(discord.getCurrentUser).toHaveBeenCalledWith('access-token');
    await agent.get('/api/auth/me').expect(200).expect({
      id: '80351110224678912',
      name: 'Alice',
      avatarUrl:
        'https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png',
    });
  });

  it('updates a returning user’s name and avatar from Discord', async () => {
    await signIn(alice);

    const { agent } = await signIn({
      ...alice,
      global_name: null,
      username: 'alice_renamed',
      avatar: null,
    });

    await agent.get('/api/auth/me').expect(200).expect({
      id: '80351110224678912',
      name: 'alice_renamed',
      // Default avatar index for this ID: (id >> 22) % 6 = 5.
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
    });
  });

  it('answers /me with 401 when nobody is signed in', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('logs out by ending the session, not just clearing the cookie', async () => {
    const { callback } = await signIn(alice);
    const sessionCookie = sessionCookieFrom(callback);

    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', sessionCookie)
      .expect(204);

    expect(logout.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^session=;/)]),
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sessionCookie)
      .expect(401);
  });

  it('expires a session after 30 days', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-11-01T12:00:00Z'),
    });
    try {
      const { callback } = await signIn(alice);
      // Sent by hand: the agent's cookie jar would drop the expired cookie itself.
      const me = () =>
        request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Cookie', sessionCookieFrom(callback));

      vi.setSystemTime(new Date('2026-12-01T11:59:00Z'));
      await me().expect(200);

      vi.setSystemTime(new Date('2026-12-01T12:01:00Z'));
      await me().expect(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.get('/api/auth/discord');

    const callback = await agent
      .get('/api/auth/discord/callback')
      .query({ code: 'auth-code', state: 'forged' })
      .expect(302);

    expect(callback.headers.location).toBe('/sign-in?error=failed');
    expect(discord.exchangeCode).not.toHaveBeenCalled();
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects a callback that arrives without a state cookie', async () => {
    const callback = await request(app.getHttpServer())
      .get('/api/auth/discord/callback')
      .query({ code: 'auth-code', state: 'anything' })
      .expect(302);

    expect(callback.headers.location).toBe('/sign-in?error=failed');
    expect(discord.exchangeCode).not.toHaveBeenCalled();
  });

  it('sends the user back to sign-in when they cancel on Discord', async () => {
    const agent = request.agent(app.getHttpServer());
    const start = await agent.get('/api/auth/discord');
    const state = new URL(start.headers.location).searchParams.get('state');

    const callback = await agent
      .get('/api/auth/discord/callback')
      .query({ error: 'access_denied', state })
      .expect(302);

    expect(callback.headers.location).toBe('/sign-in?error=failed');
    expect(discord.exchangeCode).not.toHaveBeenCalled();
  });

  it('sends the user back to sign-in when Discord fails mid sign-in', async () => {
    discord.exchangeCode.mockRejectedValue(new Error('Discord is down'));
    const agent = request.agent(app.getHttpServer());
    const start = await agent.get('/api/auth/discord');
    const state = new URL(start.headers.location).searchParams.get('state');

    const callback = await agent
      .get('/api/auth/discord/callback')
      .query({ code: 'auth-code', state })
      .expect(302);

    expect(callback.headers.location).toBe('/sign-in?error=failed');
    await agent.get('/api/auth/me').expect(401);
  });
});
