import request from 'supertest';
import type { DiscordProfile } from '../discord/discord-client.js';
import { DiscordConfig } from '../discord/discord-config.js';
import { app, discord } from './app.js';

/**
 * A Discord application to sign in through. Its redirect URI is plain
 * http, so the sign-in's cookies aren't Secure and a test's agent sends
 * them back.
 */
export const signInConfig = new DiscordConfig({
  DISCORD_CLIENT_ID: 'client-123',
  DISCORD_CLIENT_SECRET: 'shh',
  DISCORD_REDIRECT_URI: 'http://localhost:4200/api/auth/discord/callback',
  DISCORD_GUILD_ID: 'guild-1',
});

/**
 * Starts sign-in in a cookie-keeping agent, and gives the callback Discord
 * would send back to it, not yet sent.
 */
export async function startSignIn(returnTo?: string) {
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

/** How a sign-in goes: as a guild member unless told otherwise, and where it returns to. */
export interface SignInOptions {
  isGuildMember?: boolean;
  returnTo?: string;
}

/**
 * As `startSignIn`, with the faked Discord client answering as `profile`,
 * a guild member unless `isGuildMember` says otherwise.
 */
export async function startSignInAs(
  profile: DiscordProfile,
  { isGuildMember = true, returnTo }: SignInOptions = {},
) {
  discord.exchangeCode.mockResolvedValue('access-token');
  discord.getCurrentUser.mockResolvedValue(profile);
  discord.isGuildMember.mockResolvedValue(isGuildMember);
  return startSignIn(returnTo);
}

/** Runs the redirect → callback round trip in a cookie-keeping agent. */
export async function signInThroughDiscord(
  profile: DiscordProfile,
  options: SignInOptions = {},
) {
  const { agent, callback } = await startSignInAs(profile, options);
  return { agent, callback: await callback() };
}
