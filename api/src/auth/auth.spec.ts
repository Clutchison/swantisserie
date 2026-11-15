import { Controller, Get, Logger, Module, UseGuards } from '@nestjs/common';
import type { DraftView } from 'contract';
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
import { AppAdminConfig } from './app-admin-config.js';
import { AppAdminGuard } from './app-admin.guard.js';
import { AuthModule } from './auth.module.js';
import { SIGN_IN_DEADLINE_MS } from './auth.service.js';
import { useDeadlineTimers } from '../testing/deadlines.js';
import { DraftPushes } from '../drafts/draft-pushes.js';
import {
  aliceCookie,
  announcementsSettled,
  bob,
  carol,
  dave,
  failedPushes,
  getDraft,
  readyDraft,
  registerWebhook,
  signIn,
  signInAlice,
  webhookClient,
} from '../drafts/specs/harness.js';
import {
  expectPushedOnce,
  useSockets,
  versionsOf,
} from '../drafts/specs/socket-harness.js';

const config = new DiscordConfig({
  DISCORD_CLIENT_ID: 'client-123',
  DISCORD_CLIENT_SECRET: 'shh',
  DISCORD_REDIRECT_URI: 'http://localhost:4200/api/auth/discord/callback',
  DISCORD_GUILD_ID: 'guild-1',
});
const admins = new AppAdminConfig('111, 222');

/** Stands in for the app-admin-only routes later tickets add. */
@Controller('admin-only')
class AppAdminOnlyController {
  @Get()
  @UseGuards(AppAdminGuard)
  get() {
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [AppAdminOnlyController] })
class AppAdminOnlyModule {}

/**
 * Starts sign-in in a cookie-keeping agent, and gives the callback Discord
 * would send back to it, not yet sent.
 */
async function startSignIn(returnTo?: string) {
  const agent = request.agent(app.getHttpServer());
  const start = await agent
    .get('/api/auth/discord')
    .query(returnTo === undefined ? {} : { returnTo });
  const state = new URL(start.headers.location).searchParams.get('state');
  const callback = () =>
    agent
      .get('/api/auth/discord/callback')
      .query({ code: 'auth-code', state, iss: 'https://discord.com' });
  return { agent, callback };
}

/** Runs the redirect → callback round trip in a cookie-keeping agent. */
async function signInThroughDiscord(
  profile: DiscordProfile,
  {
    isGuildMember = true,
    returnTo,
  }: { isGuildMember?: boolean; returnTo?: string } = {},
) {
  discord.exchangeCode.mockResolvedValue('access-token');
  discord.getCurrentUser.mockResolvedValue(profile);
  discord.isGuildMember.mockResolvedValue(isGuildMember);
  const { agent, callback } = await startSignIn(returnTo);
  return { agent, callback: await callback() };
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

describe('Discord sign-in', () => {
  useTestApp(() =>
    startTestApp({
      overrides: [
        { provide: DiscordConfig, useValue: config },
        { provide: AppAdminConfig, useValue: admins },
      ],
      imports: [AppAdminOnlyModule],
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

  it('returns the user to the page they came from', async () => {
    const { callback } = await signInThroughDiscord(aliceProfile, {
      returnTo: '/drafts/42?tab=pool',
    });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/drafts/42?tab=pool');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    'drafts/42',
  ])('returns the user to / rather than to %j', async (returnTo) => {
    const { callback } = await signInThroughDiscord(aliceProfile, { returnTo });

    expect(callback.headers.location).toBe('/');
  });

  it('keeps the page to return to when sign-in fails, so a retry still returns there', async () => {
    const { callback } = await signInThroughDiscord(aliceProfile, {
      isGuildMember: false,
      returnTo: '/drafts/42',
    });

    expect(callback.headers.location).toBe(
      '/sign-in?error=not-allowed&returnTo=%2Fdrafts%2F42',
    );
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
    const { agent, callback } = await signInThroughDiscord(aliceProfile, {
      isGuildMember: false,
    });

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

    const { agent, callback } = await signInThroughDiscord(aliceProfile, {
      isGuildMember: false,
    });

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

  describe('when Discord is slow', () => {
    /**
     * Three of these run a second past the sign-in deadline, though each is
     * within the Discord client's own 10 s timeout.
     */
    const SLOW_CALL_MS = SIGN_IN_DEADLINE_MS / 3 + 1_000;
    /** Three of these end a call's time inside the sign-in deadline. */
    const FAIRLY_SLOW_CALL_MS = SIGN_IN_DEADLINE_MS / 4;

    beforeEach(useDeadlineTimers);
    afterEach(() => vi.useRealTimers());

    /** Signs in, letting each Discord call take `callMs` in turn. */
    async function signInSlowly(
      callMs: number,
      returnTo: string,
      { isGuildMember = true }: { isGuildMember?: boolean } = {},
    ) {
      const slowly =
        <T>(answer: T) =>
        () =>
          new Promise<T>((resolve) =>
            setTimeout(() => resolve(answer), callMs),
          );
      discord.exchangeCode.mockImplementation(slowly('access-token'));
      discord.getCurrentUser.mockImplementation(slowly(aliceProfile));
      discord.isGuildMember.mockImplementation(slowly(isGuildMember));
      const { agent, callback: sendCallback } = await startSignIn(returnTo);
      // then() sends the callback now, while the clock is moved on below.
      const callback = sendCallback().then((res) => res);
      for (const call of [
        discord.exchangeCode,
        discord.getCurrentUser,
        discord.isGuildMember,
      ]) {
        await vi.waitFor(() => expect(call).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(callMs);
      }
      return { agent, callback: await callback };
    }

    it('fails sign-in once its three calls together run past the sign-in deadline, keeping the page to return to', async () => {
      const { agent, callback } = await signInSlowly(
        SLOW_CALL_MS,
        '/drafts/42',
      );

      expect(callback.status).toBe(302);
      expect(callback.headers.location).toBe(
        '/sign-in?error=failed&returnTo=%2Fdrafts%2F42',
      );
      await agent.get('/api/auth/me').expect(401);
    });

    it('signs the user in when its three calls finish within the sign-in deadline', async () => {
      const { agent, callback } = await signInSlowly(
        FAIRLY_SLOW_CALL_MS,
        '/drafts/42',
      );

      expect(callback.headers.location).toBe('/drafts/42');
      await agent.get('/api/auth/me').expect(200);
    });

    it('still turns away a non-member when its three calls finish within the sign-in deadline', async () => {
      const { callback } = await signInSlowly(
        FAIRLY_SLOW_CALL_MS,
        '/drafts/42',
        { isGuildMember: false },
      );

      expect(callback.headers.location).toBe(
        '/sign-in?error=not-allowed&returnTo=%2Fdrafts%2F42',
      );
    });
  });

  describe('app-admin-only routes', () => {
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

describe('signing in again, to the drafts the user is in', () => {
  useTestApp(async () => {
    await startTestApp({
      overrides: [{ provide: DiscordConfig, useValue: config }],
    });
    await signInAlice();
  });
  const { listening, listeningToOwnRoom } = useSockets();

  let bobCookie: string;
  let carolCookie: string;
  /** Organized by Alice: Alice and Bob play in it. It has a webhook. */
  let aliceAndBob: string;
  /** Organized by Alice: Bob alone plays in it. */
  let bobAlone: string;
  /** Organized by Alice: Carol alone plays in it. */
  let carolAlone: string;
  /** Every draft above. */
  const everyDraft = () => [aliceAndBob, bobAlone, carolAlone];
  /** Each draft's version before the test's sign-in. */
  let versionsBefore: Map<string, number>;

  const bobProfile: DiscordProfile = {
    id: bob.id,
    username: 'bob',
    global_name: bob.name,
    avatar: null,
  };

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    carolCookie = await signIn(carol);
    const webhookId = await registerWebhook('#roto-main');
    aliceAndBob = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    bobAlone = await readyDraft([bobCookie]);
    carolAlone = await readyDraft([carolCookie]);
    await announcementsSettled(aliceAndBob);
    webhookClient.post.mockClear();
    versionsBefore = await versions();
  });

  /**
   * What is pushed to a socket watching each draft, as Dave, who is in none,
   * and to each player's own room.
   */
  async function listeningToEach() {
    return listening(everyDraft(), await signIn(dave), {
      alice: aliceCookie,
      bob: bobCookie,
      carol: carolCookie,
    });
  }

  /** Each draft's version now, by draft. */
  const versions = () => versionsOf(everyDraft());

  /** As `expectPushedOnce`, each draft newer than before the sign-in. */
  const pushedOnce = (
    pushed: DraftView[],
    ids: string[],
    check: (draft: DraftView) => void,
  ) => expectPushedOnce(pushed, ids, versionsBefore, check);

  /**
   * Signs Bob in renamed, and waits until Bob's room is pushed each of his
   * drafts once: as its push comes after any an earlier sign-in made, a test
   * can then tell that sign-in pushed nothing.
   */
  async function expectOnlyRenamePushed(bobsRoom: DraftView[]) {
    await signInThroughDiscord({ ...bobProfile, global_name: 'Robert' });
    await pushedOnce(bobsRoom, [aliceAndBob, bobAlone], (draft) =>
      expect(bobIn(draft)).toMatchObject({ name: 'Robert' }),
    );
  }

  /** Bob, as `draft` shows him. */
  function bobIn(draft: DraftView) {
    return draft.players.find((player) => player.id === bob.id);
  }

  it('pushes each draft a renamed player plays in, with their new name, to its room and its players’ own', async () => {
    const pushed = await listeningToEach();

    await signInThroughDiscord({ ...bobProfile, global_name: 'Robert' });

    const renamed = (draft: DraftView) =>
      expect(bobIn(draft)).toMatchObject({ name: 'Robert' });
    await pushedOnce(pushed.watched[aliceAndBob], [aliceAndBob], renamed);
    await pushedOnce(pushed.watched[bobAlone], [bobAlone], renamed);
    await pushedOnce(pushed.rooms.alice, [aliceAndBob], renamed);
    await pushedOnce(pushed.rooms.bob, [aliceAndBob, bobAlone], renamed);
    expect(pushed.watched[carolAlone]).toEqual([]);
    expect(pushed.rooms.carol).toEqual([]);
    expect((await getDraft(carolAlone).expect(200)).body.version).toBe(
      versionsBefore.get(carolAlone),
    );
  });

  it('pushes each draft a player plays in with their new avatar', async () => {
    const pushed = await listeningToEach();

    await signInThroughDiscord({
      ...bobProfile,
      avatar: 'a_0123456789abcdef0123456789abcdef',
    });

    await pushedOnce(pushed.rooms.bob, [aliceAndBob, bobAlone], (draft) =>
      expect(bobIn(draft)).toMatchObject({
        avatarUrl: `https://cdn.discordapp.com/avatars/${bob.id}/a_0123456789abcdef0123456789abcdef.png`,
      }),
    );
  });

  it('pushes each draft a renamed organizer organizes, with their new name, including those they don’t play in', async () => {
    const pushed = await listeningToEach();

    await signInThroughDiscord({
      id: alice.id,
      username: 'alice',
      global_name: 'Alicia',
      avatar: null,
    });

    const renamed = (draft: DraftView) =>
      expect(draft.organizer).toEqual({ id: alice.id, name: 'Alicia' });
    for (const id of everyDraft()) {
      await pushedOnce(pushed.watched[id], [id], renamed);
    }
    await pushedOnce(pushed.rooms.bob, [aliceAndBob, bobAlone], renamed);
    await pushedOnce(pushed.rooms.carol, [carolAlone], renamed);
  });

  it('bumps and pushes nothing for a sign-in with the same name and avatar', async () => {
    const pushed = await listeningToEach();

    await signInThroughDiscord(bobProfile);

    expect(await versions()).toEqual(versionsBefore);
    await expectOnlyRenamePushed(pushed.rooms.bob);
  });

  it('bumps and pushes nothing for a first sign-in', async () => {
    const pushed = await listeningToEach();

    const { agent } = await signInThroughDiscord({
      id: '80351110224678916',
      username: 'erin',
      global_name: 'Erin',
      avatar: null,
    });

    await agent.get('/api/auth/me').expect(200);
    expect(await versions()).toEqual(versionsBefore);
    await expectOnlyRenamePushed(pushed.rooms.bob);
  });

  it('keeps the user’s old name when bumping their drafts fails, and bumps none', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(DraftPushes.prototype, 'bump').mockRejectedValueOnce(
      new Error('Connection dropped'),
    );

    const { callback } = await signInThroughDiscord({
      ...bobProfile,
      global_name: 'Robert',
    });

    expect(callback.headers.location).toBe('/sign-in?error=failed');
    expect(await versions()).toEqual(versionsBefore);
    const draft = (await getDraft(aliceAndBob).expect(200)).body as DraftView;
    expect(bobIn(draft)).toMatchObject({ name: 'Bob' });
  });

  it('signs the user in when a push fails, logging it, and pushes the rest', async () => {
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    vi.spyOn(DraftPushes.prototype, 'push').mockRejectedValueOnce(
      new Error('Connection dropped'),
    );
    const bobsRoom = (await listeningToOwnRoom(bobCookie)).changes;

    const { agent, callback } = await signInThroughDiscord({
      ...bobProfile,
      global_name: 'Robert',
    });

    expect(callback.headers.location).toBe('/');
    await agent
      .get('/api/auth/me')
      .expect(200)
      .expect((res) => expect(res.body.name).toBe('Robert'));
    expect(logged).toHaveBeenCalledOnce();
    const failures = failedPushes(logged, everyDraft());
    expect(failures).toEqual([
      { draftId: expect.any(String), err: expect.any(Error) },
    ]);
    const [{ draftId: failed }] = failures;
    // The other is still pushed, and the failed one isn't.
    await vi.waitFor(() => expect(bobsRoom).toHaveLength(1));
    expect(bobsRoom.map((draft) => draft.id)).toEqual(
      [aliceAndBob, bobAlone].filter((id) => id !== failed),
    );
  });

  it('announces no sign-in', async () => {
    await signInThroughDiscord({ ...bobProfile, global_name: 'Robert' });

    await announcementsSettled(aliceAndBob);
    expect(webhookClient.post).not.toHaveBeenCalled();
  });
});
