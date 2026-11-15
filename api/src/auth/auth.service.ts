import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscordClient } from '../discord/discord-client.js';
import { DiscordConfig } from '../discord/discord-config.js';
import { Deadline } from '../deadline.js';
import { DraftPushes } from '../drafts/draft-pushes.js';
import type { User } from '../generated/prisma/client.js';
import { NewSession, SessionService } from './session.service.js';

/** The Discord user isn't in our guild. */
export class NotAllowedError extends Error {
  constructor(userId: string) {
    super(`Discord user ${userId} may not sign in`);
  }
}

/**
 * How long sign-in's three Discord calls get between them: under Heroku's
 * 30 s router limit, so a slow Discord ends on the app's sign-in page with
 * its "failed" error rather than on Heroku's error page. Each call keeps
 * its own 10 s timeout too, but three of those add up to just over 30 s.
 */
export const SIGN_IN_DEADLINE_MS = 25_000;

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
   * opens a session for them. Throws NotAllowedError for anyone else, and
   * DeadlinePassedError if Discord hasn't answered all three calls within
   * `SIGN_IN_DEADLINE_MS`, or RateLimitedPastDeadlineError, at once, if a
   * Discord 429's lockout would outlast it. When their name or avatar has
   * changed, bumps and pushes every draft they play in or organize, all of
   * which show it, announcing nothing.
   */
  async signIn(code: string): Promise<NewSession> {
    const deadline = new Deadline('sign-in', SIGN_IN_DEADLINE_MS);
    // The calls take the deadline too, to fail at once when a Discord rate
    // limit would outlast it.
    const accessToken = await deadline.race(
      this.discord.exchangeCode(code, deadline),
    );
    const profile = await deadline.race(
      this.discord.getCurrentUser(accessToken, deadline),
    );
    // Checked on every sign-in, so leaving the guild locks the user out next time.
    const isGuildMember = await deadline.race(
      this.discord.isGuildMember(accessToken, this.config.guildId, deadline),
    );
    if (!isGuildMember) {
      throw new NotAllowedError(profile.id);
    }
    await this.recordUser(profile.id, {
      name: profile.global_name ?? profile.username,
      avatar: profile.avatar,
    });
    return this.sessions.create(profile.id);
  }

  /**
   * Records the user's name and avatar from Discord, and when they have
   * changed, bumps and pushes every draft the user plays in or organizes
   * through DraftPushes, whose lock order this follows: the user's row, then
   * the drafts'.
   */
  private recordUser(
    id: string,
    fields: { name: string; avatar: string | null },
  ): Promise<void> {
    return this.pushes.changing(async (tx, bump) => {
      // Held until commit, so of two sign-ins with the same new name, only
      // the first sees the old one and bumps.
      const [before] = await tx.$queryRaw<Pick<User, 'name' | 'avatar'>[]>`
        SELECT "name", "avatar" FROM "User" WHERE "id" = ${id} FOR NO KEY UPDATE`;
      await tx.user.upsert({
        where: { id },
        create: { id, ...fields },
        update: fields,
      });
      // A first sign-in is in no draft yet.
      if (
        before &&
        (before.name !== fields.name || before.avatar !== fields.avatar)
      ) {
        await bump({
          OR: [{ organizerId: id }, { players: { some: { userId: id } } }],
        });
      }
    });
  }
}
