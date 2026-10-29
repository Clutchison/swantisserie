/** The Discord application's OAuth2 settings (see .env.example). */
export abstract class DiscordConfig {
  abstract readonly clientId: string;
  abstract readonly clientSecret: string;
  /** Must exactly match a redirect URI registered on the Discord app. */
  abstract readonly redirectUri: string;
}

export function discordConfigFromEnv(): DiscordConfig {
  // Read lazily so the app (and tests that don't sign in) can boot without them.
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return {
    get clientId() {
      return required('DISCORD_CLIENT_ID');
    },
    get clientSecret() {
      return required('DISCORD_CLIENT_SECRET');
    },
    get redirectUri() {
      return required('DISCORD_REDIRECT_URI');
    },
  };
}
