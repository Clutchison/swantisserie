import type { TournamentRefusal } from 'contract';
import type { TournamentState } from '../generated/prisma/client.js';

/** What correctionRefusal reads of a tournament. */
export interface CorrectionRow {
  state: TournamentState;
  lastCompletedRound: number;
  reopenedRound: number | null;
}

/**
 * Why an organizer can't correct or clear a match of tournament round
 * `round` of the tournament `row`, whose results are final: every match
 * once the tournament is complete, and the matches of a completed
 * tournament round, until it is reopened, which the refusal suggests for
 * the last completed round while no round is reopened. Null while they
 * can: the round is open, or, in round robin, which has no tournament
 * rounds, the tournament is playing. Both the refusals and the read's
 * `correctable` come from here, so they can't disagree.
 */
export function correctionRefusal(
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
    message:
      round === row.lastCompletedRound && row.reopenedRound === null
        ? `Tournament round ${round} is completed, so its results are final. Reopen it to change them.`
        : `Tournament round ${round} is completed, so its results are final.`,
  };
}
