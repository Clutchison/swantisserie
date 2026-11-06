import { Injectable } from '@nestjs/common';
import type { LeaderboardView } from 'contract';
import { leaderboard } from 'engine';
import { PrismaService } from '../prisma/prisma.service.js';
import { readCompleteTournaments } from '../tournaments/complete-tournaments.js';
import { toLeaderboardTournament } from './leaderboard-tournament.js';

/** The leaderboard. Until drafts belong to guilds (#208), it covers every draft's tournament. */
@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The leaderboard of every complete tournament, ranked by trophies, then
   * matches won, computed on each read from their standings. Cancelled
   * tournaments are gone, so count nowhere, and neither does a tournament
   * any bot played in, as bots exist for testing; so no bot ever appears,
   * as every bot of a draft joins its tournament.
   */
  async read(): Promise<LeaderboardView> {
    const complete = await readCompleteTournaments(this.prisma);
    const entries = leaderboard(
      complete
        .filter(({ botsPlayed }) => !botsPlayed)
        .map(({ view }) => toLeaderboardTournament(view)),
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: entries.map((entry) => entry.playerId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(users.map((user) => [user.id, user.name]));
    const name = (playerId: string) => {
      const found = nameOf.get(playerId);
      if (found === undefined)
        throw new Error(`No user ${playerId} for a leaderboard player`);
      return found;
    };
    return entries.map((entry) => ({ ...entry, name: name(entry.playerId) }));
  }
}
