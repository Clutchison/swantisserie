import type { TournamentView } from 'contract';
import type { LeaderboardTournament } from 'engine';

/**
 * The complete tournament `view` as the leaderboard reads it: its players,
 * its matches without its byes, and its trophy holders.
 */
export function toLeaderboardTournament(
  view: TournamentView,
): LeaderboardTournament {
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
