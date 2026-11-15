import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscordClient } from '../discord/discord-client.js';
import { DiscordConfig } from '../discord/discord-config.js';
import { Deadline } from '../deadline.js';
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
  ) {}

  /**
   * Completes Discord OAuth: checks the user may sign in, records them and
   * opens a session for them. Throws NotAllowedError for anyone else, and
   * DeadlinePassedError if Discord hasn't answered all three calls within
   * `SIGN_IN_DEADLINE_MS`.
   */
  async signIn(code: string): Promise<NewSession> {
    const deadline = new Deadline('sign-in', SIGN_IN_DEADLINE_MS);
    const accessToken = await deadline.race(this.discord.exchangeCode(code));
    const profile = await deadline.race(
      this.discord.getCurrentUser(accessToken),
    );
    // Checked on every sign-in, so leaving the guild locks the user out next time.
    const isGuildMember = await deadline.race(
      this.discord.isGuildMember(accessToken, this.config.guildId),
    );
    if (!isGuildMember) {
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
