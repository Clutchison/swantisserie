/** How the api and its database are doing: the body of GET /api/health, a 503 included. */
export interface HealthView {
  api: 'ok';
  db: 'ok' | 'error';
}
