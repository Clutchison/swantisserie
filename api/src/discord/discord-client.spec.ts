import { FetchDiscordClient } from './discord-client.js';
import { DiscordConfig } from './discord-config.js';

describe('FetchDiscordClient', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  let discord: FetchDiscordClient;

  const profile = {
    id: '42',
    username: 'swan',
    global_name: 'Swan',
    avatar: null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetch);
    discord = new FetchDiscordClient(
      new DiscordConfig({
        DISCORD_CLIENT_ID: 'client-id',
        DISCORD_CLIENT_SECRET: 'client-secret',
        DISCORD_REDIRECT_URI: 'https://swantisserie.example/auth/callback',
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function respond(status: number, body: unknown = {}) {
    fetch.mockResolvedValueOnce(Response.json(body, { status }));
  }

  /** A fetch that never answers, until its signal aborts it. */
  function hang() {
    fetch.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal!.reason),
          );
        }),
    );
  }

  describe('exchangeCode', () => {
    it('sends the code form-encoded with the app’s Basic auth, and returns the access token', async () => {
      respond(200, { access_token: 'token-1', token_type: 'Bearer' });

      expect(await discord.exchangeCode('code-1')).toBe('token-1');

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://discord.com/api/v10/oauth2/token');
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('Content-Type')).toBe(
        'application/x-www-form-urlencoded',
      );
      expect(headers.get('Authorization')).toBe(
        `Basic ${btoa('client-id:client-secret')}`,
      );
      expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: 'https://swantisserie.example/auth/callback',
      });
    });

    it('throws when Discord refuses the code', async () => {
      respond(400, { error: 'invalid_grant' });

      await expect(discord.exchangeCode('code-1')).rejects.toThrow();
    });
  });

  describe('getCurrentUser', () => {
    it('returns the signed-in user’s profile', async () => {
      respond(200, profile);

      expect(await discord.getCurrentUser('token-1')).toEqual(profile);

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://discord.com/api/v10/users/@me');
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer token-1',
      );
    });
  });

  describe('isGuildMember', () => {
    it('is true when the user is in the guild', async () => {
      respond(200, { nick: null, roles: [] });

      expect(await discord.isGuildMember('token-1', 'guild-1')).toBe(true);

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(
        'https://discord.com/api/v10/users/@me/guilds/guild-1/member',
      );
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer token-1',
      );
    });

    it('is false when the user isn’t in the guild', async () => {
      respond(404, { message: 'Unknown Guild', code: 10004 });

      expect(await discord.isGuildMember('token-1', 'guild-1')).toBe(false);
    });
  });

  const calls: [string, () => Promise<unknown>][] = [
    ['exchangeCode', () => discord.exchangeCode('code-1')],
    ['getCurrentUser', () => discord.getCurrentUser('token-1')],
    ['isGuildMember', () => discord.isGuildMember('token-1', 'guild-1')],
  ];

  describe.each(calls)('%s', (_, call) => {
    it('throws on a server error', async () => {
      respond(503);

      await expect(call()).rejects.toThrow();
    });

    it('throws when Discord can’t be reached', async () => {
      fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(call()).rejects.toThrow();
    });

    it('gives up with an error after 10 seconds without an answer', async () => {
      vi.useFakeTimers();
      hang();

      const outcome = call().then(
        () => 'resolved',
        (err: unknown) => err,
      );
      await vi.advanceTimersByTimeAsync(9_999);
      expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(await outcome).toBeInstanceOf(Error);
    });
  });
});
