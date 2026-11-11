import type { NamedPoolSourceView } from './drafts.js';
import type { PlaceView, TallyView } from './tournaments.js';

/** How the signed-in player did in one complete tournament they joined. */
export interface MyStatsResultView {
  draftId: string;
  draftName: string;
  poolSource: NamedPoolSourceView;
  /** When the tournament completed, ISO; null for one completed before completion times were kept. */
  completedAt: string | null;
  place: PlaceView;
  /** Their record in its final standings, as its Play tab shows it: byes, forfeits and granted results count. */
  matches: TallyView;
  /** Whether they hold its trophy, alone or shared. */
  trophy: boolean;
}

/**
 * The signed-in player's My stats, from `GET /api/my-stats`, which returns
 * only their own: over complete tournaments, leaving out any a bot played in.
 * Its records and win rates count played matches only, so forfeits, granted
 * draws, granted wins and byes are left out; each result's record is its
 * standings'. Rates are from 0 to 100, with no floor, and null when there is
 * nothing to count them over.
 */
export interface MyStatsView {
  tournamentsPlayed: number;
  /** A shared trophy counts as a whole one. */
  trophies: number;
  trophyRate: number | null;
  matches: TallyView;
  matchWinRate: number | null;
  games: TallyView;
  gameWinRate: number | null;
  /** Null with no tournament played. */
  bestFinish: PlaceView | null;
  /** Newest first. */
  results: MyStatsResultView[];
}
