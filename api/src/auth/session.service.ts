import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { type Observable, Subject } from 'rxjs';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface NewSession {
  /** Goes in the cookie; only its hash is stored. */
  token: string;
  expiresAt: Date;
}

/** A session that hasn't ended, and who it signs in. */
export interface LiveSession {
  /** Its stored id: the hash of its token, never the token. */
  id: string;
  user: User;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  private readonly endings = new Subject<string>();

  /**
   * The id of each live session as it ends, so whatever it kept open, such
   * as a draft socket, can close. Every way of ending a live session
   * announces it here; one expiring is not, so whatever it kept open
   * watches for its expiry itself, as each draft socket's own timer does.
   */
  readonly ended: Observable<string> = this.endings.asObservable();

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string): Promise<NewSession> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.prisma.$transaction([
      // Sign-ins are rare enough to double as the sweep for dead sessions.
      this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.prisma.session.create({
        data: { id: hash(token), userId, expiresAt },
      }),
    ]);
    return { token, expiresAt };
  }

  /** The token's session, or null if it is unknown or expired. */
  find(token: string): Promise<LiveSession | null> {
    return this.live(hash(token));
  }

  /** Whether the session of id `id` is still live: not ended nor expired. */
  async isLive(id: string): Promise<boolean> {
    return (await this.live(id)) !== null;
  }

  /** Ends the token's session, and announces that it has ended. */
  async revoke(token: string): Promise<void> {
    const id = hash(token);
    await this.prisma.session.deleteMany({ where: { id } });
    this.endings.next(id);
  }

  /** The one check of a session, for requests and sockets alike. */
  private async live(id: string): Promise<LiveSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { user: true },
    });
    return session && session.expiresAt > new Date() ? session : null;
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
