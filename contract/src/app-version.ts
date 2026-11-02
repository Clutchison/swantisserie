/** Which commit is live, as app admins are sent it: null when the build didn't record one. */
export interface AppVersionView {
  commit: string | null;
}
