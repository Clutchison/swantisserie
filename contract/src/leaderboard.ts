import type { TallyView } from './tournaments.js';

/** A player's match and game records against one opponent: a head-to-head record. */
export interface HeadToHeadRecordView {
  /** The opponent's Discord user id: a `LeaderboardPlayerView.playerId`. */
  playerId: string;
  matches: TallyView;
  games: TallyView;
}

/** One player's line on the leaderboard. */
export interface LeaderboardPlayerView {
  /** The player's Discord user id. */
  playerId: string;
  /** Their user's current name. */
  name: string;
  trophies: number;
  /** The complete tournaments they joined. */
  tournamentsPlayed: number;
  /** Played matches only: forfeits, granted draws, granted wins and byes are left out. */
  matches: TallyView;
  games: TallyView;
  /** Their head-to-head record against each opponent they've played, in leaderboard order. */
  opponents: HeadToHeadRecordView[];
}

/**
 * The leaderboard, from `GET /api/leaderboard`, which every signed-in user
 * may read: from complete tournaments only, each player with a played
 * match, by trophies, then matches won. Bots never appear.
 */
export type LeaderboardView = LeaderboardPlayerView[];
