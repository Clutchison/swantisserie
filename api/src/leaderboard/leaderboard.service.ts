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
   * matches won, computed on each read from their standings, so a
   * correction after completion moves its trophy. Cancelled tournaments
   * are gone, so count nowhere. Bots never join a tournament, and are left
   * out all the same.
   */
  async read(): Promise<LeaderboardView> {
    const complete = await readCompleteTournaments(this.prisma);
    const entries = leaderboard(
      complete.map(({ view }) => toLeaderboardTournament(view)),
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: entries.map((entry) => entry.playerId) } },
      select: { id: true, name: true, isBot: true },
    });
    const userOf = new Map(users.map((user) => [user.id, user]));
    const user = (playerId: string) => {
      const found = userOf.get(playerId);
      if (!found)
        throw new Error(`No user ${playerId} for a leaderboard player`);
      return found;
    };
    const human = (playerId: string) => !user(playerId).isBot;
    return entries
      .filter((entry) => human(entry.playerId))
      .map((entry) => ({
        ...entry,
        name: user(entry.playerId).name,
        opponents: entry.opponents.filter((o) => human(o.playerId)),
      }));
  }
}
