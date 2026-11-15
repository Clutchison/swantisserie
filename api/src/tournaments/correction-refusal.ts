import type { TournamentRefusal } from 'contract';
import type { TournamentState } from '../generated/prisma/client.js';

/** What correctionRefusal and finalResultsRefusal read of a tournament. */
export interface CorrectionRow {
  state: TournamentState;
  lastCompletedRound: number;
  reopenedRound: number | null;
}

/**
 * Why a match of tournament round `round` of the tournament `row` has
 * final results, or null while they can change (ADR 0009): a complete
 * tournament's results are final, and so are a completed tournament
 * round's until it is reopened. Round robin, which has no tournament
 * rounds, is final only once the tournament is complete. The message
 * suits a player, as it suggests nothing only an organizer can do.
 */
export function finalResultsRefusal(
  row: CorrectionRow,
  round: number,
): TournamentRefusal | null {
  if (row.state === 'Complete') {
    return {
      error: 'tournament-complete',
      message: 'This tournament is complete, so its results are final.',
    };
  }
  if (round > row.lastCompletedRound) return null;
  return {
    error: 'round-completed',
    message: `Tournament round ${round} is completed, so its results are final.`,
  };
}

/**
 * Why an organizer can't correct or clear a match of tournament round
 * `round` of the tournament `row`, or null when they can: when its results
 * are final, as finalResultsRefusal decides. For the last completed round,
 * while no round is reopened, the refusal suggests Reopen round. Both the
 * refusals and the read's `correctable` come from here, so they can't
 * disagree.
 */
export function correctionRefusal(
  row: CorrectionRow,
  round: number,
): TournamentRefusal | null {
  const refusal = finalResultsRefusal(row, round);
  if (
    refusal?.error === 'round-completed' &&
    round === row.lastCompletedRound &&
    row.reopenedRound === null
  ) {
    return {
      ...refusal,
      message: `${refusal.message} Reopen it to change them.`,
    };
  }
  return refusal;
}
