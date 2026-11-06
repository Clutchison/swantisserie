import { Controller, Get, UseGuards } from '@nestjs/common';
import type { LeaderboardView } from 'contract';
import { leaderboard } from 'engine';
import { SessionGuard } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toLeaderboardTournament } from '../tournaments/leaderboard-tournament.js';
import { TOURNAMENT_VIEW } from '../tournaments/tournament-view.js';

/**
 * Where signed-in users read the leaderboard. Until drafts belong to
 * guilds (#208), it covers every draft's tournament.
 */
@Controller('leaderboard')
@UseGuards(SessionGuard)
export class LeaderboardController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The leaderboard of every complete tournament, ranked by trophies, then
   * matches won, computed on each read from their standings, so a
   * correction after completion moves its trophy. Cancelled tournaments
   * are gone, so count nowhere. Bots never join a tournament, and are left
   * out all the same.
   */
  @Get()
  async read(): Promise<LeaderboardView> {
    const rows = await this.prisma.tournament.findMany({
      where: { state: 'Complete' },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: TOURNAMENT_VIEW,
    });
    const entries = leaderboard(rows.map(toLeaderboardTournament));
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
