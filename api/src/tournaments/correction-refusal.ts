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
 * `round` of the tournament `row`, or null when they can. A complete
 * tournament's results are final, and so are a completed tournament
 * round's until it is reopened; for the last completed round, while no
 * round is reopened, the refusal suggests Reopen round. Round robin, which
 * has no tournament rounds, is correctable while the tournament is
 * playing. Both the refusals and the read's `correctable` come from here,
 * so they can't disagree.
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
