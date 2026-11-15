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
    const bumped = await this.recordUser(profile.id, {
      name: profile.global_name ?? profile.username,
      avatar: profile.avatar,
    });
    await this.pushes.pushAll(bumped);
    return this.sessions.create(profile.id);
  }

  /**
   * Records the user's name and avatar from Discord. When they have changed,
   * bumps every draft the user plays in or organizes, all of which show them,
   * in the same transaction. Returns the ids of the drafts bumped, for
   * `pushAll` once it commits.
   */
  private recordUser(
    id: string,
    fields: { name: string; avatar: string | null },
  ): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id },
        select: { name: true, avatar: true },
      });
      // Locks the user's row, then the bump locks the drafts' rows. A locked
      // draft change, such as a join, holds its draft's row but only a key
      // share lock on the user's, which this update doesn't wait on, so
      // neither waits on the other in turn.
      await tx.user.upsert({
        where: { id },
        create: { id, ...fields },
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
        OR: [{ organizerId: id }, { players: { some: { userId: id } } }],
      });
    });
  }
}
