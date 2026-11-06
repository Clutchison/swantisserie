import type { CompleteRoundRequest } from 'contract';
import type { RoundCompletionInput } from 'engine';
import type {
  TournamentFormat,
  TournamentState,
} from '../generated/prisma/client.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import { SINGLE_ELIMINATION_STEPS } from './single-elimination.js';
import { SWISS_STEPS } from './swiss-rounds.js';

/** The tournament round Complete round is completing, and what it was asked. */
export interface RoundToDecide {
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
  /** Decides the round’s unreported matches, with any drops, before Complete round checks none is left. */
  decide(tx: Transaction, round: RoundToDecide): Promise<void>;
  /** How Complete round's refusal tells the organizer to decide `unreported` matches, after reporting them. */
  decideHint(unreported: number): string;
  /** Pairs tournament round `round`, the next. */
  pairNext(tx: Transaction, tournamentId: string, round: number): Promise<void>;
  /**
   * What the engine's roundCompletion reads of tournament round `round` of
   * `roundCount` rounds, once it is decided, for Complete round to decide whether
   * it completes the tournament.
   */
  completionInput(
    tx: Transaction,
    tournamentId: string,
    round: number,
    roundCount: number,
  ): Promise<RoundCompletionInput>;
}

/**
 * The round steps of each format that plays one tournament round at a
 * time; round robin, which has no tournament rounds, has none.
 */
export const ROUND_STEPS: Partial<Record<TournamentFormat, RoundSteps>> = {
  Swiss: SWISS_STEPS,
  SingleElimination: SINGLE_ELIMINATION_STEPS,
};
