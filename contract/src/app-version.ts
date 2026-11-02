/** Which commit is live, as app admins are sent it: null when the build didn't record one. */
export interface AppVersionView {
  commit: string | null;
}

/** How the api and its database are doing: the body of GET /api/health, a 503 included. */
export interface HealthView {
  api: 'ok';
  db: 'ok' | 'error';
}
