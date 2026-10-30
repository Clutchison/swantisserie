import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { redirectToCanonicalHost } from './canonical-host.js';

export const API_PREFIX = 'api';

/** Settings shared by the real server and the HTTP tests. */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix(API_PREFIX);
  app.use(redirectToCanonicalHost(process.env.DISCORD_REDIRECT_URI));
  app.use(cookieParser());
  return app;
}
