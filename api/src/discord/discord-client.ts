import { Injectable } from '@nestjs/common';
import { DiscordConfig } from './discord-config.js';

const API = 'https://discord.com/api/v10';

/** The fields of `GET /users/@me` we use. */
export interface DiscordProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

/** The fields of a guild member object we use. */
export interface DiscordGuildMember {
  /** Role IDs. */
  roles: string[];
}

/** Discord's OAuth2 and user endpoints: the boundary faked in tests. */
export abstract class DiscordClient {
  /** Exchanges an authorization code for the user's access token. */
  abstract exchangeCode(code: string): Promise<string>;
  abstract getCurrentUser(accessToken: string): Promise<DiscordProfile>;
  /** The user's membership of `guildId`, or null if they aren't in it. */
  abstract getGuildMember(
    accessToken: string,
    guildId: string,
  ): Promise<DiscordGuildMember | null>;
}

@Injectable()
export class FetchDiscordClient extends DiscordClient {
  constructor(private readonly config: DiscordConfig) {
    super();
  }

  async exchangeCode(code: string): Promise<string> {
    const { clientId, clientSecret, redirectUri } = this.config;
    // Discord accepts only form-encoded token requests.
    const res = await fetch(`${API}/oauth2/token`, {
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
    if (!res.ok) {
      throw new Error(`Discord token exchange failed: ${res.status}`);
    }
    const { access_token } = (await res.json()) as { access_token: string };
    return access_token;
  }

  async getCurrentUser(accessToken: string): Promise<DiscordProfile> {
    const res = await fetch(`${API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Discord /users/@me failed: ${res.status}`);
    }
    return (await res.json()) as DiscordProfile;
  }

  async getGuildMember(
    accessToken: string,
    guildId: string,
  ): Promise<DiscordGuildMember | null> {
    const res = await fetch(`${API}/users/@me/guilds/${guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Discord guild member lookup failed: ${res.status}`);
    }
    return (await res.json()) as DiscordGuildMember;
  }
}
