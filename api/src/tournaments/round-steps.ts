import type { ClearedMatchView, CompleteRoundRequest } from 'contract';
import type {
  MatchOutcomeKind,
  MatchSide,
  TournamentState,
} from '../generated/prisma/client.js';
import type { Transaction } from '../drafts/draft-shapes.js';

/** The tournament round Complete round is completing, and what it was asked. */
export interface RoundToSettle {
  tournamentId: string;
  round: number;
  /** Whether it is the tournament's final tournament round. */
  finalRound: boolean;
  request: Required<CompleteRoundRequest>;
}

/** What a format's round steps read of the tournament they change. */
export interface TournamentProgress {
  id: string;
  state: TournamentState;
  lastCompletedRound: number;
}

/**
 * What an organizer's correction or clear writes to a match: its new
 * outcome, every field only another outcome uses back to its default.
 */
export interface MatchChange {
  outcome: MatchOutcomeKind;
  firstGames: number;
  secondGames: number;
  drawnGames: number;
  forfeitedBy: MatchSide | null;
  grantedTo: null;
  reportedById: string | null;
  confirmed: false;
}

/** What starting and completing tournament rounds does that depends on the format. */
export interface RoundSteps {
  /** Makes tournament round 1 at Start, from `entryIds`, the joined entries in join order. */
  start(
    tx: Transaction,
    tournamentId: string,
    entryIds: readonly string[],
  ): Promise<void>;
  /** Settles the round's unreported matches, and any drops, before Complete round checks none is left. */
  settle(tx: Transaction, round: RoundToSettle): Promise<void>;
  /** How Complete round's refusal tells the organizer to settle `unreported` matches, after reporting them. */
  settleHint(unreported: number): string;
  /** Pairs tournament round `round`, the next. */
  pairNext(tx: Transaction, tournamentId: string, round: number): Promise<void>;
  /**
   * How many players are still in once tournament round `round` is
   * settled, for Complete round to complete the tournament when fewer than
   * MIN_UNDROPPED_PLAYERS are. Formats without one count the undropped.
   */
  stillIn?(
    tx: Transaction,
    tournamentId: string,
    round: number,
  ): Promise<number>;
  /**
   * Whether clearing a match of a completed tournament round reopens that
   * round, the match unreported, rather than making it a granted draw.
   */
  reopensCleared?: true;
  /**
   * Writes an organizer's `change` to the match `matchId`, and changes
   * what depends on it. Formats without one write just the match.
   */
  changeMatch?(
    tx: Transaction,
    tournament: TournamentProgress,
    matchId: string,
    change: MatchChange,
  ): Promise<void>;
  /** The later matches `changeMatch` would clear for the same change, writing nothing. */
  previewChange?(
    tx: Transaction,
    tournament: TournamentProgress,
    matchId: string,
    change: MatchChange,
  ): Promise<ClearedMatchView[]>;
  /**
   * Throws TournamentRefusedError if the dropped entry `entryId` can't be
   * reinstated as their drop has fed a later pairing. Formats without one
   * refuse once a tournament round has been paired without them.
   */
  refuseReinstate?(
    tx: Transaction,
    tournament: TournamentProgress,
    entryId: string,
  ): Promise<void>;
}
