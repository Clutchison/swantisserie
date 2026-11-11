import type { StandingView, TournamentView } from 'contract';
import { droppedPlayers } from 'engine';
import { place } from '../record';

/** Where a table of a tournament's standings shows, which decides how its ranks and players read. */
export interface StandingCellsOptions {
  /** In the Tournament summary: ranks as places, dropped players and trophy holders marked. */
  summary: boolean;
  /** Whether the table marks dropped players wherever it shows, as the results grid does on the Play tab. */
  alwaysMarksDropped: boolean;
}

/**
 * How `standing`, one of `tournament`'s, reads in a table of its
 * standings, its player named `name`: its rank, and its player, marked
 * "(dropped)" once they have dropped. In the Tournament summary the rank
 * is its place, such as =2nd, as the api reads it, and a trophy holder is
 * marked 🏆; elsewhere
 * the rank is a number, and only a table that always marks dropped
 * players marks them.
 */
export function standingCells(
  tournament: TournamentView,
  standing: StandingView,
  name: string,
  { summary, alwaysMarksDropped }: StandingCellsOptions,
): { rank: string; name: string } {
  const dropped =
    (summary || alwaysMarksDropped) &&
    droppedPlayers(tournament.entries).includes(standing.playerId);
  const marked = dropped ? `${name} (dropped)` : name;
  if (!summary) return { rank: String(standing.rank), name: marked };
  return {
    rank: place(standing),
    name: tournament.trophyHolders.includes(standing.playerId) ? `${marked} 🏆` : marked,
  };
}
