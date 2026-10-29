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

/** Discord's OAuth2 and user endpoints: the boundary faked in tests. */
export abstract class DiscordClient {
  /** Exchanges an authorization code for the user's access token. */
  abstract exchangeCode(code: string): Promise<string>;
  abstract getCurrentUser(accessToken: string): Promise<DiscordProfile>;
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
}
