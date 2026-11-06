import type { CompleteRoundRequest } from 'contract';
import type { ScheduledRound } from 'engine';
import type { Transaction } from '../drafts/draft-shapes.js';

/** The tournament round Complete round is completing, and what it was asked. */
export interface RoundToSettle {
  tournamentId: string;
  round: number;
  /** Whether it is the tournament's final tournament round. */
  finalRound: boolean;
  request: Required<CompleteRoundRequest>;
}

/** What completing a tournament round does that depends on the format. */
export interface RoundSteps {
  /** Settles the round's unreported matches, and any drops, before Complete round checks none is left. */
  settle(tx: Transaction, round: RoundToSettle): Promise<void>;
  /** How Complete round's refusal tells the organizer to settle `unreported` matches, after reporting them. */
  settleHint(unreported: number): string;
  /** Pairs tournament round `round`, the next. */
  pairNext(tx: Transaction, tournamentId: string, round: number): Promise<void>;
}

/** What a match's settling reads of each of its entries. */
export const ENTRY_OF_MATCH = {
  id: true,
  dropped: true,
  player: { select: { userId: true } },
} as const;

/** Makes the matches and byes of `rounds`, whose players are tournament entry ids. */
export async function createRounds(
  tx: Transaction,
  tournamentId: string,
  rounds: readonly ({ round: number } & ScheduledRound)[],
) {
  await tx.match.createMany({
    data: rounds.flatMap(({ round, matches, bye }) => [
      ...matches.map(([firstEntryId, secondEntryId]) => ({
        tournamentId,
        round,
        firstEntryId,
        secondEntryId,
      })),
      ...(bye ? [{ tournamentId, round, firstEntryId: bye }] : []),
    ]),
  });
}
