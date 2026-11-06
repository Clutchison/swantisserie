import type { LeaderboardTournament } from 'engine';
import type { Prisma } from '../generated/prisma/client.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/**
 * The complete tournament `row` as the leaderboard reads it: its players,
 * its matches without its byes, and its trophy holders, read from its
 * standings as the tournament read does, so a correction moves them.
 */
export function toLeaderboardTournament(
  row: Prisma.TournamentGetPayload<{ select: typeof TOURNAMENT_VIEW }>,
): LeaderboardTournament {
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
}
