import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscordClient } from '../discord/discord-client.js';
import { DiscordConfig } from '../discord/discord-config.js';
import { NewSession, SessionService } from './session.service.js';

/** The Discord user isn't in our guild, or lacks the roto-draft role. */
export class NotAllowedError extends Error {
  constructor(userId: string) {
    super(`Discord user ${userId} may not sign in`);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly discord: DiscordClient,
    private readonly config: DiscordConfig,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Completes Discord OAuth: checks the user may sign in, records them and
   * opens a session for them. Throws NotAllowedError for anyone else.
   */
  async signIn(code: string): Promise<NewSession> {
    const accessToken = await this.discord.exchangeCode(code);
    const profile = await this.discord.getCurrentUser(accessToken);
    // Checked on every sign-in, so losing the role locks the user out next time.
    const member = await this.discord.getGuildMember(
      accessToken,
      this.config.guildId,
    );
    if (!member?.roles.includes(this.config.roleId)) {
      throw new NotAllowedError(profile.id);
    }
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
