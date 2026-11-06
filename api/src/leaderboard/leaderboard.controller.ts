import { Controller, Get, UseGuards } from '@nestjs/common';
import type { LeaderboardView } from 'contract';
import { leaderboard, type LeaderboardTournament } from 'engine';
import { SessionGuard } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TOURNAMENT_VIEW,
  toTournamentView,
} from '../tournaments/tournament-view.js';

/**
 * Where signed-in users read the leaderboard. Until drafts belong to
 * guilds (#208), it covers every draft's tournament.
 */
@Controller('leaderboard')
@UseGuards(SessionGuard)
export class LeaderboardController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The leaderboard of every complete tournament, computed on each read
   * from their standings, so a correction after completion moves its
   * trophy. Cancelled tournaments are gone, so count nowhere. Bots never
   * join a tournament, and are left out all the same.
   */
  @Get()
  async read(): Promise<LeaderboardView> {
    const rows = await this.prisma.tournament.findMany({
      where: { state: 'Complete' },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: TOURNAMENT_VIEW,
    });
    const tournaments = rows.map((row): LeaderboardTournament => {
      const view = toTournamentView(row);
      return {
        players: view.entries.map((entry) => entry.playerId),
        matches: view.rounds
          .flatMap((round) => round.matches)
          .map(({ players, outcome }) => ({
            players,
            outcome: outcome.kind === 'Unreported' ? null : outcome,
          })),
        trophyHolders: view.trophyHolders,
      };
    });
    const entries = leaderboard(tournaments);
    const users = await this.prisma.user.findMany({
      where: { id: { in: entries.map((entry) => entry.playerId) } },
      select: { id: true, name: true, isBot: true },
    });
    const userOf = new Map(users.map((user) => [user.id, user]));
    const human = (playerId: string) => !userOf.get(playerId)!.isBot;
    return entries
      .filter((entry) => human(entry.playerId))
      .map((entry) => ({
        ...entry,
        name: userOf.get(entry.playerId)!.name,
        opponents: entry.opponents.filter((o) => human(o.playerId)),
      }));
  }
}
