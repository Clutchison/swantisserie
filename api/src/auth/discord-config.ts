/** The Discord application's OAuth2 settings (see .env.example). */
export class DiscordConfig {
  // Read lazily so the app (and tests that don't sign in) can boot without them.
  constructor(private readonly env: Record<string, string | undefined>) {}

  get clientId(): string {
    return this.required('DISCORD_CLIENT_ID');
  }

  get clientSecret(): string {
    return this.required('DISCORD_CLIENT_SECRET');
  }

  /** Must exactly match a redirect URI registered on the Discord app. */
  get redirectUri(): string {
    return this.required('DISCORD_REDIRECT_URI');
  }

  /**
   * Whether our cookies need the Secure flag. Derived from the redirect URI,
   * which must be exactly right for login to work at all, rather than from a
   * separate setting that could drift.
   */
  get secureCookies(): boolean {
    return this.redirectUri.startsWith('https:');
  }

  private required(name: string): string {
    const value = this.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  }
}
