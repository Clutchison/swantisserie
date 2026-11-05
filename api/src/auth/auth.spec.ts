import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import request from 'supertest';
import { DiscordProfile } from '../discord/discord-client.js';
import { DiscordConfig } from '../discord/discord-config.js';
import {
  alice,
  app,
  discord,
  startTestApp,
  useTestApp,
} from '../testing/app.js';
import { AdminConfig } from './admin-config.js';
import { AdminGuard } from './admin.guard.js';
import { AuthModule } from './auth.module.js';

const config = new DiscordConfig({
  DISCORD_CLIENT_ID: 'client-123',
  DISCORD_CLIENT_SECRET: 'shh',
  DISCORD_REDIRECT_URI: 'http://localhost:4200/api/auth/discord/callback',
  DISCORD_GUILD_ID: 'guild-1',
});
const admins = new AdminConfig('111, 222');

/** Stands in for the admin-only routes later tickets add. */
@Controller('admin-only')
class AdminOnlyController {
  @Get()
  @UseGuards(AdminGuard)
  get() {
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [AdminOnlyController] })
class AdminOnlyModule {}

describe('Discord sign-in', () => {
  useTestApp(() =>
    startTestApp({
      overrides: [
        { provide: DiscordConfig, useValue: config },
        { provide: AdminConfig, useValue: admins },
      ],
      imports: [AdminOnlyModule],
    }),
  );

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
  async function signInThroughDiscord(
    profile: DiscordProfile,
    isGuildMember = true,
  ) {
    discord.exchangeCode.mockResolvedValue('access-token');
    discord.getCurrentUser.mockResolvedValue(profile);
    discord.isGuildMember.mockResolvedValue(isGuildMember);
    const agent = request.agent(app.getHttpServer());
    const start = await agent.get('/api/auth/discord');
    const state = new URL(start.headers.location).searchParams.get('state');
    const callback = await agent
      .get('/api/auth/discord/callback')
      .query({ code: 'auth-code', state, iss: 'https://discord.com' });
    return { agent, callback };
  }

  /** `session=<token>`, ready for a Cookie header. */
  function sessionCookieFrom(res: request.Response): string {
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return cookies.find((c) => c.startsWith('session='))!.split(';')[0];
  }

  const aliceProfile: DiscordProfile = {
    id: alice.id,
    username: 'alice',
    global_name: alice.name,
    avatar: '8342729096ea3675442027381ff50dfe',
  };

  it('signs the user in on callback and reports them from /me', async () => {
    const { agent, callback } = await signInThroughDiscord(aliceProfile);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/');
    expect(discord.exchangeCode).toHaveBeenCalledWith('auth-code');
    expect(discord.getCurrentUser).toHaveBeenCalledWith('access-token');
    await agent.get('/api/auth/me').expect(200).expect({
      id: '80351110224678912',
      name: 'Alice',
      avatarUrl:
        'https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png',
      isAppAdmin: false,
    });
  });

  it('flags app admins from config in /me', async () => {
    const { agent } = await signInThroughDiscord({
      ...aliceProfile,
      id: '222',
    });

    const me = await agent.get('/api/auth/me').expect(200);

    expect(me.body).toMatchObject({ id: '222', isAppAdmin: true });
  });

  it('updates a returning user’s name and avatar from Discord', async () => {
    await signInThroughDiscord(aliceProfile);

    const { agent } = await signInThroughDiscord({
      ...aliceProfile,
      global_name: null,
      username: 'alice_renamed',
      avatar: null,
    });

    await agent.get('/api/auth/me').expect(200).expect({
      id: '80351110224678912',
      name: 'alice_renamed',
      // Default avatar index for this ID: (id >> 22) % 6 = 5.
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
      isAppAdmin: false,
    });
  });

  it('turns away someone who is not in our guild', async () => {
    const { agent, callback } = await signInThroughDiscord(aliceProfile, false);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/sign-in?error=not-allowed');
    expect(discord.isGuildMember).toHaveBeenCalledWith(
      'access-token',
      'guild-1',
    );
    await agent.get('/api/auth/me').expect(401);
  });

  it('re-checks guild membership on every sign-in', async () => {
    const first = await signInThroughDiscord(aliceProfile);
    await first.agent.get('/api/auth/me').expect(200);

    const { agent, callback } = await signInThroughDiscord(aliceProfile, false);

    expect(callback.headers.location).toBe('/sign-in?error=not-allowed');
    await agent.get('/api/auth/me').expect(401);
  });

  it('answers /me with 401 when nobody is signed in', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('logs out by ending the session, not just clearing the cookie', async () => {
    const { callback } = await signInThroughDiscord(aliceProfile);
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
      const { callback } = await signInThroughDiscord(aliceProfile);
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

  it('rejects a callback whose issuer is not Discord', async () => {
    const agent = request.agent(app.getHttpServer());
    const start = await agent.get('/api/auth/discord');
    const state = new URL(start.headers.location).searchParams.get('state');

    const callback = await agent
      .get('/api/auth/discord/callback')
      .query({ code: 'auth-code', state, iss: 'https://evil.example' })
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

    expect(discord.exchangeCode).toHaveBeenCalledWith('auth-code');
    expect(callback.headers.location).toBe('/sign-in?error=failed');
    await agent.get('/api/auth/me').expect(401);
  });

  describe('admin-only routes', () => {
    it('let app admins through', async () => {
      const { agent } = await signInThroughDiscord({
        ...aliceProfile,
        id: '111',
      });

      await agent.get('/api/admin-only').expect(200).expect({ ok: true });
    });

    it('reject signed-in users who are not app admins', async () => {
      const { agent } = await signInThroughDiscord(aliceProfile);

      await agent.get('/api/admin-only').expect(403);
    });

    it('reject signed-out requests', async () => {
      await request(app.getHttpServer()).get('/api/admin-only').expect(401);
    });
  });
});
