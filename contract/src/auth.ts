/** The signed-in user, as `GET /api/auth/me` reports them. */
export interface UserView {
  id: string;
  name: string;
  avatarUrl: string;
  /**
   * App admins have organizer powers on every draft, which the web reads from
   * the draft powers (ADR 0003), not from here. It reads this only for the
   * app-admin pages that aren't about a draft.
   */
  isAppAdmin: boolean;
}

/**
 * Why sign-in failed, sent as `/sign-in?error=<code>` by the api's Discord
 * callback: `not-allowed` when the user isn't a guild member, `failed`
 * otherwise.
 */
export type SignInError = 'failed' | 'not-allowed';
