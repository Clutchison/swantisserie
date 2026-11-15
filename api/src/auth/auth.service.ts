import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscordClient } from '../discord/discord-client.js';
import { DiscordConfig } from '../discord/discord-config.js';
import { DraftPushes } from '../drafts/draft-pushes.js';
import { NewSession, SessionService } from './session.service.js';

/** The Discord user isn't in our guild. */
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
    private readonly pushes: DraftPushes,
  ) {}

  /**
   * Completes Discord OAuth: checks the user may sign in, records them and
   * opens a session for them. Throws NotAllowedError for anyone else. When
   * their name or avatar has changed, pushes every draft they play in or
   * organize, all of which show it.
   */
  async signIn(code: string): Promise<NewSession> {
    const accessToken = await this.discord.exchangeCode(code);
    const profile = await this.discord.getCurrentUser(accessToken);
    // Checked on every sign-in, so leaving the guild locks the user out next time.
    const isGuildMember = await this.discord.isGuildMember(
      accessToken,
      this.config.guildId,
    );
    if (!isGuildMember) {
      throw new NotAllowedError(profile.id);
    }
    const fields = {
      name: profile.global_name ?? profile.username,
      avatar: profile.avatar,
    };
    const bumped = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: profile.id },
        select: { name: true, avatar: true },
      });
      await tx.user.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
      // A first sign-in is in no draft yet.
      if (
        !before ||
        (before.name === fields.name && before.avatar === fields.avatar)
      ) {
        return [];
      }
      return this.pushes.bump(tx, {
        OR: [
          { organizerId: profile.id },
          { players: { some: { userId: profile.id } } },
        ],
      });
    });
    await this.pushes.pushAll(bumped);
    return this.sessions.create(profile.id);
  }
}
