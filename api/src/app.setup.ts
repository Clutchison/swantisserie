import { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api';

/** Settings shared by the real server and the HTTP tests. */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix(API_PREFIX);
  return app;
}
