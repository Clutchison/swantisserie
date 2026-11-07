import type { TournamentRefusal } from './draft-errors.js';
import type { PlanBoards, PreferredPrintings } from './plan.js';

/** How a tournament pairs its players, chosen once at tournament setup. */
export type TournamentFormat = 'RoundRobin' | 'Swiss' | 'SingleElimination';

/**
 * Each tournament format's name as it reads mid-sentence, such as "a
 * round robin tournament", in the order tournament setup offers them.
 */
export const TOURNAMENT_FORMAT_NAMES: Record<TournamentFormat, string> = {
  RoundRobin: 'round robin',
  Swiss: 'Swiss',
  SingleElimination: 'single elimination',
};

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
 * enough to show the Play tab and know to read the tournament.
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
   * Whether they can be taken out of the tournament and put back in:
   * removed during registration, dropped by an organizer, themselves or
   * Complete round, and reinstated. Never a bot, which stays in its
   * tournament from setup to the end.
   */
  droppable: boolean;
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
  /**
   * The Discord user ids of its players who may confirm it now: while it
   * is unconfirmed, those confirming would accept, who didn't report its
   * game score. None without a game score, and none once it is confirmed,
   * though confirming accepts a confirmed match again, changing nothing.
   */
  confirmableBy: string[];
  /**
   * What clearing it, as an organizer can while its tournament round is
   * `correctable`, would leave it as: the forfeit of a player of it who has
   * dropped, otherwise unreported. Null when it already is that, so
   * clearing would change nothing.
   */
  clearLeaves: MatchOutcomeView | null;
}

/**
 * One tournament round: its matches, and the players with a bye. Round
 * robin has no tournament rounds, so it reads as one, round 1, holding
 * every match, with no byes.
 */
export interface TournamentRoundView {
  /** From 1. */
  round: number;
  /**
   * Whether an organizer can still correct or clear its matches, as the
   * tournament stands, whoever is viewing: while it is open and the
   * tournament is playing, or in round robin, which has no tournament
   * rounds, while the tournament is playing. False once it is completed,
   * until it is reopened, and in a complete tournament. Who may organize
   * comes from the draft powers.
   */
  correctable: boolean;
  /** In bracket place order in single elimination; otherwise in the order of their first players’ joining, then their second players’. */
  matches: MatchView[];
  /**
   * The Discord user ids of the players sitting this round out: at most one
   * in Swiss, none in round robin; in single elimination, the top seeds' in
   * round 1, and later each player whose would-be opponent nobody sent on,
   * in bracket place order.
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
   * side is the player who advances from the place feeding it as soon as
   * that result is agreed, even before its round is completed: a granted
   * win, a forfeit, or a game score the other player confirmed or an
   * organizer entered. When nobody advances from that place, the side is a
   * bye at once, the other side first.
   */
  sides: [BracketSideView, BracketSideView];
  /**
   * The Discord user id of the player who advances from it: its match's
   * winner once its result is agreed, as `sides` describes, or once its
   * round is completed; or the player with its bye, unless they dropped.
   * Null until then, and when nobody advances: from a forfeit both its
   * players dropped from, a dropped player's bye, or a place both of whose
   * sides are byes.
   */
  advancing: string | null;
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
  /** Whether it has public decklists, chosen at tournament setup. */
  publicDecklists: boolean;
  /**
   * Whether everyone who sees the draft may read its decklists now: under
   * public decklists, once it is playing, and still once it is complete.
   */
  showsDecklists: boolean;
  state: TournamentState;
  /**
   * How many tournament rounds it will have, for the players joined so far
   * during registration. Always 0 in round robin, which has none.
   */
  roundCount: number;
  /**
   * The last tournament round an organizer completed, from 1; 0 before any.
   * Always 0 in round robin, which has no tournament rounds.
   */
  lastCompletedRound: number;
  /** In join order. */
  entries: TournamentEntryView[];
  /**
   * Every tournament round paired so far, in order, once it is playing; none
   * during registration. Swiss pairs them one at a time; round robin makes
   * every match at the start, as one round.
   */
  rounds: TournamentRoundView[];
  /**
   * Single elimination only, once it is playing: the bracket, every
   * tournament round of it, paired or not, in order. Null in other formats
   * and during registration.
   */
  bracket: BracketRoundView[] | null;
  /**
   * What Complete round gives the current tournament round's unreported
   * matches: granted draws in Swiss, with a choice of players to drop from
   * each; granted wins in single elimination, for the winner the organizer
   * picks, or else the drop of one or both players. Null in round robin,
   * which completes the tournament instead.
   */
  completeRoundGrants: 'GrantedDraws' | 'GrantedWins' | null;
  /**
   * Whether the standings wait for each tournament round, as in Swiss and
   * single elimination: while the tournament is playing they count only
   * completed tournament rounds, so they change when a round is completed,
   * not with each result. Otherwise, as in round robin, they count every
   * result as it is reported.
   */
  standingsAwaitCompletedRounds: boolean;
  /**
   * Reopen round of the last completed tournament round, as an organizer
   * is offered it: in Swiss and single elimination, while the tournament
   * is playing and at least one round is completed; null otherwise.
   */
  reopenRound: ReopenRoundView | null;
  /** Best first, once it is playing; none during registration. */
  standings: StandingView[];
  /**
   * The Discord user ids of the players who hold the trophy once it is
   * complete, else none: everyone who shares first; in single elimination
   * the player who advances from the final, or the one player left in the
   * bracket when it completed before the final, and nobody when no player
   * is left, as when both finalists dropped.
   */
  trophyHolders: string[];
}

/**
 * Reopen round of the last completed tournament round: whether it would
 * be refused, and what it takes back.
 */
export interface ReopenRoundView {
  /** The tournament round it reopens: the last completed. */
  round: number;
  /**
   * Why it would be refused, such as a match of the next tournament round
   * having a game score; null when it wouldn't.
   */
  refusal: TournamentRefusal | null;
  /**
   * The Discord user ids of the players whose drops it takes back, in join
   * order: those dropped in completing the round or since.
   */
  takesBackDrops: string[];
}

/**
 * What the draft list shows of a complete draft's tournament, for the
 * signed-in viewer: its tournament badge.
 */
export interface TournamentBadgeView {
  state: TournamentState;
  /**
   * Whether the viewer may join it now, as joining would let them: during
   * registration, one of the draft's human players who has left it or been
   * removed, whatever their deck holds.
   */
  canJoin: boolean;
  /** The trophy holders' Discord user ids, each a `PlayerView.id`; empty until it is complete. */
  trophyHolders: string[];
}

/**
 * The tournament as the signed-in viewer reads it: everyone's view, with
 * whether they may join it now, as joining decides (ADR 0003).
 */
export interface ViewerTournamentView extends TournamentView {
  /** Whether the viewer may join now: during registration, one of the draft's players whom joining would let in. */
  canJoin: boolean;
  /**
   * Why joining would refuse the viewer, one of the draft's players,
   * during registration, such as having joined already; null when it wouldn't,
   * outside registration, and for anyone who isn't one of the draft's players.
   */
  joinRefusal: TournamentRefusal | null;
}

/**
 * A match's game score as its player reports it, or an organizer corrects
 * it. Only 2–0 and 2–1, for either side.
 */
export interface MatchReportRequest {
  games: GameScore;
}

/**
 * Complete round, as the organizer decides the tournament round’s
 * unreported matches: each must be listed. In Swiss each becomes a granted
 * draw; in single elimination, which never has a draw, a granted win for the
 * winner the organizer picks, or a forfeit by the players they drop from
 * it. A list can be left out when empty.
 */
export interface CompleteRoundRequest {
  /**
   * The tournament round the organizer is completing, the one they checked.
   * Complete round refuses it unless it is still the current one.
   */
  round: number;
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
 * Tournament setup, as the organizer chooses it: all at once, never
 * changed. Without `publicDecklists` it has none.
 */
export type TournamentSetupRequest = (
  | { format: 'RoundRobin' }
  | { format: 'Swiss'; swissRoundOption: SwissRoundOption }
  | { format: 'SingleElimination' }
) & { publicDecklists?: boolean };

/**
 * A joined player's locked deck as others see it under public decklists,
 * as it was when the tournament started, its basic lands showing its
 * player's preferred printings as they are now. From
 * `GET /api/drafts/:id/tournament/decklists`, which serves one per joined
 * player, in join order, once `TournamentView.showsDecklists`.
 */
export interface DecklistView extends PlanBoards {
  /** The player's Discord user id: a `PlayerView.id`. */
  playerId: string;
  /** The player's preferred printings as they are now, not as they were at Start: a printing is not part of what the lock fixes. */
  preferredPrintings: PreferredPrintings;
}

/** The fewest cards a joined human player's mainboard, picks plus basic lands, holds for the tournament to start. */
export const MIN_MAINBOARD_CARDS = 40;

/** The fewest joined players, bots included, a tournament needs to start. */
export const MIN_TOURNAMENT_PLAYERS = 2;
