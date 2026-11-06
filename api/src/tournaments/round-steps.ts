import type { CompleteRoundRequest } from 'contract';
import type { TournamentState } from '../generated/prisma/client.js';
import type { Transaction } from '../drafts/draft-shapes.js';

/** The tournament round Complete round is completing, and what it was asked. */
export interface RoundToSettle {
  tournamentId: string;
  round: number;
  /** Whether it is the tournament's final tournament round. */
  finalRound: boolean;
  request: Required<CompleteRoundRequest>;
}

/** What a format's steps read of the tournament they change. */
export interface TournamentProgress {
  id: string;
  state: TournamentState;
  lastCompletedRound: number;
}

/**
 * What starting and completing tournament rounds does that depends on the
 * format, for the formats that play one tournament round at a time.
 */
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
   * How many players are left to play on once tournament round `round` is
   * settled, for Complete round to complete the tournament when fewer than
   * MIN_UNDROPPED_PLAYERS are.
   */
  playersLeft(
    tx: Transaction,
    tournamentId: string,
    round: number,
  ): Promise<number>;
}
