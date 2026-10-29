import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../generated/prisma/client.js';
import { AdminConfig } from './admin-config.js';
import { SessionService } from './session.service.js';

export const SESSION_COOKIE = 'session';

/** The signed-in user, as @CurrentUser() supplies them. */
export interface SessionUser extends User {
  /** Read from config on each request, so a change applies without re-login. */
  isAdmin: boolean;
}

export type AuthedRequest = Request & { user?: SessionUser };

/** The session token from the request's cookie, if it has one. */
export function sessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' ? token : undefined;
}

/** Rejects requests without a live session; otherwise exposes @CurrentUser(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly admins: AdminConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = sessionToken(req);
    const user = token ? await this.sessions.findUser(token) : null;
    if (!user) throw new UnauthorizedException();
    req.user = { ...user, isAdmin: this.admins.isAdmin(user.id) };
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): SessionUser =>
    context.switchToHttp().getRequest<AuthedRequest>().user!,
);
