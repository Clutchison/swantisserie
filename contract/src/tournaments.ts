/** How a tournament pairs its players, chosen once at tournament setup. */
export type TournamentFormat = 'RoundRobin' | 'Swiss' | 'SingleElimination';

/**
 * The Swiss round options tournament setup offers, in the order it offers
 * them: until there's a winner (the ceiling of log2 of its joined players),
 * or capped at 3.
 */
export const SWISS_ROUND_OPTIONS = ['UntilWinner', 'CappedAt3'] as const;

/**
 * How many tournament rounds a Swiss tournament plays, chosen at tournament
 * setup: one of SWISS_ROUND_OPTIONS. The engine's SwissRoundOption is the
 * same type.
 */
export type SwissRoundOption = (typeof SWISS_ROUND_OPTIONS)[number];

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
  /**
   * Single elimination only: their place in the seed order, from 1, which
   * Start shuffles; null in other formats and during registration.
   */
  seed: number | null;
}

/**
 * A match's game score: each player's games won, in the match's player
 * order, such as [2, 1].
 */
export type GameScore = [number, number];

/**
 * How a match stands: unreported, or decided by a game score (each
 * player's games won, in the match's player order, plus drawn games), a
 * granted draw (0–0), a forfeit by the player who dropped, or, in single
 * elimination, a granted win for the player the organizer picked, with no
 * games.
 */
export type MatchOutcomeView =
  | { kind: 'Unreported' }
  | { kind: 'GameScore'; games: GameScore; draws: number }
  | { kind: 'GrantedDraw' }
  | { kind: 'Forfeit'; forfeitedBy: string }
  | { kind: 'GrantedWin'; winner: string };

/** One match of a tournament. */
export interface MatchView {
  id: string;
  /** The two players' Discord user ids, in the order the game score follows. */
  players: [string, string];
  /**
   * Single elimination only: its bracket place within its tournament round,
   * from 0. Bracket place p is fed by the winners of places 2p and 2p + 1 of the round
   * before. Null in other formats.
   */
  bracketPlace: number | null;
  outcome: MatchOutcomeView;
  /** The Discord user id of whoever reported it; null until it is reported. */
  reportedBy: string | null;
  /** Whether the other player confirmed the game score it was reported with. */
  confirmed: boolean;
}

/** One tournament round: its matches, and the players with a bye. */
export interface TournamentRoundView {
  /** From 1: the suggested order to play the rounds in. */
  round: number;
  /** In bracket place order in single elimination; otherwise in the order of their first players’ joining. */
  matches: MatchView[];
  /**
   * The Discord user ids of the players sitting this round out: at most one
   * in round robin and Swiss; in single elimination, the top seeds' in
   * round 1, in bracket place order.
   */
  byes: string[];
}

/**
 * Who a side of a bracket place is: a player, a bye, or, until the result
 * of the bracket place of the tournament round before that feeds it is
 * agreed, the winner to come of that place. The engine's BracketSide is the
 * same type.
 */
export type BracketSideView =
  | { kind: 'Player'; playerId: string }
  | { kind: 'Bye' }
  | { kind: 'WinnerToCome'; bracketPlace: number };

/** One bracket place of a single elimination tournament round. */
export interface BracketPlaceView {
  /** From 0. Bracket place p is fed by places 2p and 2p + 1 of the round before. */
  bracketPlace: number;
  /** The id of the match played at it, a `MatchView.id`; null for a bye, and until its round is paired. */
  matchId: string | null;
  /**
   * Its two sides, in the match's player order once paired. Until then, a
   * side is the winner of the place feeding it as soon as that result is
   * agreed, even before its round is completed: a granted win, a forfeit, or
   * a game score the other player confirmed or an organizer entered.
   */
  sides: [BracketSideView, BracketSideView];
  /**
   * The Discord user id of the player who won its match or had its bye;
   * null until its result is agreed, as `sides` describes, or its round is
   * completed.
   */
  winner: string | null;
}

/** One tournament round of the bracket: every one of its bracket places, in order. */
export interface BracketRoundView {
  round: number;
  places: BracketPlaceView[];
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
   * From 0 to 100. In round robin, games won as a percentage of games
   * played; 0 before any game is played. In Swiss, the MTR's: game points
   * as a percentage of 3 per game played, floored at 33, so 33 before any
   * game is played.
   */
  gameWinPercent: number;
  /** Swiss only: the average of the player's opponents' match-win %, each floored at 33; 33 before they meet one. */
  opponentsMatchWinPercent?: number;
  /** Swiss only: the average of the player's opponents' game-win %, each floored at 33; 33 before they meet one. */
  opponentsGameWinPercent?: number;
}

/**
 * A draft's tournament, from `GET /api/drafts/:id/tournament`, which
 * everyone who sees the draft may read once it exists.
 */
export interface TournamentView {
  format: TournamentFormat;
  /** A Swiss tournament's round option; null in other formats. */
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
  /**
   * Single elimination only, once it is playing: the bracket, every
   * tournament round of it, paired or not, in order. Null in other formats
   * and during registration.
   */
  bracket: BracketRoundView[] | null;
  /**
   * Whether correcting or clearing a match can clear later matches, as in
   * single elimination: then an organizer's correction asks the correction
   * preview first.
   */
  correctionsPreview: boolean;
  /** Best first, once it is playing; none during registration. */
  standings: StandingView[];
  /**
   * The Discord user ids of the players who hold the trophy: everyone who
   * shares first once it is complete, which in single elimination is the
   * winner of the final alone; else none.
   */
  trophyHolders: string[];
}

/**
 * A match's game score as its player reports it, or an organizer corrects
 * it. Only 2–0 and 2–1, for either side.
 */
export interface MatchReportRequest {
  games: GameScore;
}

/**
 * Complete round, as the organizer settles the tournament round's
 * unreported matches: each must be listed. In Swiss each becomes a granted
 * draw; in single elimination, which never has a draw, a granted win for the
 * winner the organizer picks, or a forfeit by the players they drop from
 * it. A list can be left out when empty, and the body when the tournament
 * round has no unreported match.
 */
export interface CompleteRoundRequest {
  /** Swiss only. */
  grantedDraws?: GrantedDrawRequest[];
  /** Single elimination only. */
  grantedWins?: GrantedWinRequest[];
  /** Single elimination only: a match listed here isn't also listed in `grantedWins`. */
  drops?: MatchDropRequest[];
}

/**
 * One unreported single elimination match that Complete round drops
 * players from, making it their forfeit. With both dropped, nobody
 * advances from it, and whoever would have met its winner has a bye.
 */
export interface MatchDropRequest {
  matchId: string;
  /** The Discord user ids of its players to drop: one or both. */
  drop: string[];
}

/** One unreported single elimination match that Complete round gives a granted win in. */
export interface GrantedWinRequest {
  matchId: string;
  /** The Discord user id of the match's player who wins it and advances. */
  winner: string;
}

/** One unreported match that Complete round grants a draw in. */
export interface GrantedDrawRequest {
  matchId: string;
  /**
   * The Discord user ids of its players to drop: either, both or neither.
   * Ignored in the final tournament round, which completes the tournament.
   */
  drop: string[];
}

/**
 * A correction an organizer is about to make, from
 * `POST /api/drafts/:id/tournament/matches/:matchId/game-score/preview`:
 * the match's new game score, or null to clear it.
 */
export interface GameScorePreviewRequest {
  games: GameScore | null;
}

/**
 * What a correction or clear would do beyond its own match: in single
 * elimination, the later matches it would clear because it changes who
 * advances from the match, and whether it completes the tournament or has
 * it played on. None in other formats, or when the same player advances.
 */
export interface GameScorePreview {
  /** In tournament round order. */
  clears: ClearedMatchView[];
  /**
   * The tournament's state once it is made: Complete when it leaves one
   * player in the bracket, Playing when it reopens a complete tournament.
   */
  state: TournamentState;
}

/** A tournament round and a bracket place in it. The engine's RoundAndBracketPlace is the same type. */
export interface RoundAndBracketPlace {
  round: number;
  bracketPlace: number;
}

/**
 * A later single elimination match, or bye, a correction would clear: the
 * one the match feeds is paired again with its new winner, unreported, and
 * those after are unpaired until their tournament rounds are paired again.
 */
export interface ClearedMatchView extends RoundAndBracketPlace {
  /** The Discord user ids of the players it has now: one for a bye. */
  players: string[];
}

/** Tournament setup, as the organizer chooses it: all at once, never changed. */
export type TournamentSetupRequest =
  | { format: 'RoundRobin' }
  | { format: 'Swiss'; swissRoundOption: SwissRoundOption }
  | { format: 'SingleElimination' };

/** The fewest cards a deck's mainboard, picks plus basic lands, holds to join a tournament. */
export const MIN_MAINBOARD_CARDS = 40;
