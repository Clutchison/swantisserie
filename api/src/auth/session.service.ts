import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface NewSession {
  /** Goes in the cookie; only its hash is stored. */
  token: string;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string): Promise<NewSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: { id: hash(token), userId, expiresAt },
    });
    return { token, expiresAt };
  }

  /** The signed-in user, or null if the token is unknown or expired. */
  async findUser(token: string): Promise<User | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: hash(token) },
      include: { user: true },
    });
    return session && session.expiresAt > new Date() ? session.user : null;
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: hash(token) } });
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
