import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscordClient } from './discord-client.js';
import { NewSession, SessionService } from './session.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly discord: DiscordClient,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /** Completes Discord OAuth: records the user and opens a session for them. */
  async signIn(code: string): Promise<NewSession> {
    const accessToken = await this.discord.exchangeCode(code);
    const profile = await this.discord.getCurrentUser(accessToken);
    const fields = {
      name: profile.global_name ?? profile.username,
      avatar: profile.avatar,
    };
    await this.prisma.user.upsert({
      where: { id: profile.id },
      create: { id: profile.id, ...fields },
      update: fields,
    });
    return this.sessions.create(profile.id);
  }
}
