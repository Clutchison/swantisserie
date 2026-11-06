/**
 * How a tournament pairs its players, chosen once at tournament setup.
 * Single elimination comes with its spec.
 */
export type TournamentFormat = 'RoundRobin' | 'Swiss';

/**
 * How many tournament rounds a Swiss tournament plays, chosen at tournament
 * setup: until there's a winner (the ceiling of log2 of its joined players),
 * or capped at 3. The engine's SwissRoundOption is the same type.
 */
export type SwissRoundOption = 'UntilWinner' | 'CappedAt3';

/** Registration → Playing → Complete. The glossary has the long form. */
export type TournamentState = 'Registration' | 'Playing' | 'Complete';

/**
 * What every viewer of a draft is told of its tournament, on `DraftView`:
 * enough to show the Tournament tab and know to read the tournament.
 */
export interface TournamentSummaryView {
  state: TournamentState;
}

/** A player who has joined a tournament. */
export interface TournamentEntryView {
  /** The player's Discord user id: a `PlayerView.id`. */
  playerId: string;
  /** Whether they have dropped: their unplayed matches are forfeits. */
  dropped: boolean;
}

/**
 * A match's game score: each player's games won, in the match's player
 * order, such as [2, 1].
 */
export type GameScore = [number, number];

/**
 * How a match stands: unreported, or decided by a game score (each
 * player's games won, in the match's player order, plus drawn games), a
 * granted draw (0–0), or a forfeit by the player who dropped.
 */
export type MatchOutcomeView =
  | { kind: 'Unreported' }
  | { kind: 'GameScore'; games: GameScore; draws: number }
  | { kind: 'GrantedDraw' }
  | { kind: 'Forfeit'; forfeitedBy: string };

/** One match of a tournament. */
export interface MatchView {
  id: string;
  /** The two players' Discord user ids, in the order the game score follows. */
  players: [string, string];
  outcome: MatchOutcomeView;
  /** The Discord user id of whoever reported it; null until it is reported. */
  reportedBy: string | null;
  /** Whether the other player confirmed the game score it was reported with. */
  confirmed: boolean;
}

/** One tournament round: its matches, and the player with a bye, if any. */
export interface TournamentRoundView {
  /** From 1: the suggested order to play the rounds in. */
  round: number;
  matches: MatchView[];
  /** The Discord user id of the player sitting this round out; null if nobody is. */
  bye: string | null;
}

/** Matches or games won, lost and drawn. */
export interface TallyView {
  won: number;
  lost: number;
  drawn: number;
}

/** One player's place in a tournament's standings. */
export interface StandingView {
  /** The player's Discord user id: a `PlayerView.id`. */
  playerId: string;
  /** From 1. Players still tied after every tiebreaker share a rank. */
  rank: number;
  matchPoints: number;
  matches: TallyView;
  games: TallyView;
  /**
   * From 0 to 100; 0 before any game is played. In round robin, games won
   * as a percentage of games played. In Swiss, the MTR's: game points as a
   * percentage of 3 per game played, floored at 33.
   */
  gameWinPercent: number;
  /** Swiss only: the average of the player's opponents' match-win %, each floored at 33; 0 before they meet one. */
  opponentsMatchWinPercent?: number;
  /** Swiss only: the average of the player's opponents' game-win %, each floored at 33; 0 before they meet one. */
  opponentsGameWinPercent?: number;
}

/**
 * A draft's tournament, from `GET /api/drafts/:id/tournament`, which
 * everyone who sees the draft may read once it exists.
 */
export interface TournamentView {
  format: TournamentFormat;
  /** A Swiss tournament's round option; null for round robin. */
  swissRoundOption: SwissRoundOption | null;
  state: TournamentState;
  /** How many tournament rounds it will have, for the players joined so far during registration. */
  roundCount: number;
  /**
   * The last tournament round an organizer completed, from 1; 0 before any.
   * Always 0 in round robin, which plays its rounds all at once.
   */
  lastCompletedRound: number;
  /** In join order. */
  entries: TournamentEntryView[];
  /**
   * Every tournament round paired so far, in order, once it is playing; none
   * during registration. Round robin pairs all of them at the start, Swiss
   * one at a time.
   */
  rounds: TournamentRoundView[];
  /** Best first, once it is playing; none during registration. */
  standings: StandingView[];
  /** The Discord user ids of the players who hold the trophy: everyone who shares first once it is complete, else none. */
  trophyHolders: string[];
}

/**
 * A match's game score as its player reports it, or an organizer corrects
 * it. Only 2–0 and 2–1, for either side.
 */
export interface MatchReportRequest {
  games: GameScore;
}

/** Tournament setup, as the organizer chooses it: all at once, never changed. */
export type TournamentSetupRequest =
  | { format: 'RoundRobin' }
  | { format: 'Swiss'; swissRoundOption: SwissRoundOption };

/** The fewest cards a deck's mainboard, picks plus basic lands, holds to join a tournament. */
export const MIN_MAINBOARD_CARDS = 40;
