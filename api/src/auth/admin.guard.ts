import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type AuthedRequest, SessionGuard } from './session.guard.js';

/** Like SessionGuard, but also rejects users who are not app admins. */
@Injectable()
export class AdminGuard extends SessionGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;
    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!user?.isAdmin) throw new ForbiddenException();
    return true;
  }
}
