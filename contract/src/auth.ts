/** The signed-in user, as `GET /api/auth/me` reports them. */
export interface UserView {
  id: string;
  name: string;
  avatarUrl: string;
  /** App admins have organizer powers on every draft. */
  isAppAdmin: boolean;
}

/**
 * Why sign-in failed, sent as `/sign-in?error=<code>` by the api's Discord
 * callback: `not-allowed` when the user isn't a guild member, `failed`
 * otherwise.
 */
export type SignInError = 'failed' | 'not-allowed';
