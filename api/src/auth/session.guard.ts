import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../generated/prisma/client.js';
import { SessionService } from './session.service.js';

export const SESSION_COOKIE = 'session';

type AuthedRequest = Request & { user?: User };

/** The session token from the request's cookie, if it has one. */
export function sessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' ? token : undefined;
}

/** Rejects requests without a live session; otherwise exposes @CurrentUser(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = sessionToken(req);
    const user = token ? await this.sessions.findUser(token) : null;
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<AuthedRequest>().user!,
);
