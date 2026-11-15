import { Injectable } from '@nestjs/common';
import { Deadline } from '../deadline.js';
import { cancelBody, fetchWithTimeout } from '../http/fetch-with-timeout.js';
import { bodyOrHeaderRetryAfterMs } from '../http/retry-after.js';
import { DiscordConfig } from './discord-config.js';

const API = 'https://discord.com/api/v10';
/** How long each request, its body included, may take: sign-in waits on it. */
const REQUEST_TIMEOUT_MS = 10_000;

/** The fields of `GET /users/@me` we use. */
export interface DiscordProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

/**
 * Discord's OAuth2 and user endpoints: the boundary faked in tests. Each
 * call takes the sign-in's `deadline`, and fails at once rather than wait
 * out a rate limit that would end past it.
 */
export abstract class DiscordClient {
  /** Exchanges an authorization code for the user's access token. */
  abstract exchangeCode(code: string, deadline: Deadline): Promise<string>;
  abstract getCurrentUser(
    accessToken: string,
    deadline: Deadline,
  ): Promise<DiscordProfile>;
  /** Whether the user is in `guildId`. */
  abstract isGuildMember(
    accessToken: string,
    guildId: string,
    deadline: Deadline,
  ): Promise<boolean>;
}

/** Discord rate-limited the call, and its wait would end past the deadline. */
export class RateLimitedPastDeadlineError extends Error {
  constructor(deadline: Deadline) {
    super(`Discord's rate limit ends past the ${deadline.name} deadline.`);
  }
}

@Injectable()
export class FetchDiscordClient extends DiscordClient {
  /**
   * When the last 429's wait is over (ms since epoch). Pending while that
   * 429's body is read for its wait, so no call slips through meanwhile.
   */
  private lockedUntil: Promise<number> = Promise.resolve(0);

  constructor(private readonly config: DiscordConfig) {
    super();
  }

  async exchangeCode(code: string, deadline: Deadline): Promise<string> {
    const { clientId, clientSecret, redirectUri } = this.config;
    // Discord accepts only form-encoded token requests. A 429 means Discord
    // didn't act on the single-use code, so sending it again is safe.
    const res = await this.send(deadline, `${API}/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) await failWith(res, 'Discord token exchange failed');
    const { access_token } = (await res.json()) as { access_token: string };
    return access_token;
  }

  async getCurrentUser(
    accessToken: string,
    deadline: Deadline,
  ): Promise<DiscordProfile> {
    const res = await this.send(deadline, `${API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) await failWith(res, 'Discord /users/@me failed');
    return (await res.json()) as DiscordProfile;
  }

  async isGuildMember(
    accessToken: string,
    guildId: string,
    deadline: Deadline,
  ): Promise<boolean> {
    const res = await this.send(
      deadline,
      `${API}/users/@me/guilds/${guildId}/member`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.status === 404) {
      await cancelBody(res);
      return false;
    }
    if (!res.ok) await failWith(res, 'Discord guild member lookup failed');
    // Only the status matters: the member itself is never read.
    await cancelBody(res);
    return true;
  }

  /**
   * Sends a request to Discord once any rate limit's wait has passed,
   * giving up after the timeout. After a 429 it waits as long as Discord
   * says and sends once more; the answer to that is returned, 429 or not.
   * Throws RateLimitedPastDeadlineError, at once, for a wait that would end
   * past `deadline`.
   */
  private async send(
    deadline: Deadline,
    url: string,
    init: Omit<RequestInit, 'signal'>,
  ): Promise<Response> {
    for (let rateLimited = 0; ; rateLimited++) {
      await this.waitOutRateLimit(deadline);
      const res = await fetchWithTimeout(url, init, REQUEST_TIMEOUT_MS);
      if (res.status !== 429) return res;
      // Hold every call from now, not just this one, while the wait is read.
      this.lockedUntil = latest(this.lockedUntil, rateLimitEnd(res));
      if (rateLimited === 1) return res;
    }
  }

  /**
   * Resolves once the last 429's wait has passed, at once if there is none,
   * or throws if it would end past `deadline`. Waits again if a 429 that
   * arrived meanwhile moved the wait on.
   */
  private async waitOutRateLimit(deadline: Deadline): Promise<void> {
    for (;;) {
      const until = await this.lockedUntil;
      if (until > deadline.endsAt) {
        throw new RateLimitedPastDeadlineError(deadline);
      }
      if (Date.now() >= until) return;
      await new Promise((resolve) => setTimeout(resolve, until - Date.now()));
    }
  }
}

/**
 * When a 429's wait ends (ms since epoch): its body's `retry_after`, or else
 * its `Retry-After` header. Reads the body. Discord always says; if it
 * didn't, there is no wait to hold calls for.
 */
async function rateLimitEnd(res: Response): Promise<number> {
  return Date.now() + ((await bodyOrHeaderRetryAfterMs(res)) ?? 0);
}

/** The later of two times. */
async function latest(a: Promise<number>, b: Promise<number>): Promise<number> {
  return Math.max(await a, await b);
}

/**
 * Throws for `res`'s failing status, `what` naming the request, cancelling
 * its unread body first. A 429's body has already been read for its wait.
 */
async function failWith(res: Response, what: string): Promise<never> {
  if (res.status !== 429) await cancelBody(res);
  throw new Error(`${what}: ${res.status}`);
}
