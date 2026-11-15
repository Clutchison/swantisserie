import type { TournamentRefusal } from 'contract';
import type { TournamentState } from '../generated/prisma/client.js';

/** What the rules of final results read of a tournament. */
export interface RoundStateRow {
  state: TournamentState;
  lastCompletedRound: number;
  reopenedRound: number | null;
}

/** Why a match's results are final: its tournament is complete, or its tournament round is completed. */
type Finality = 'tournament' | 'round';

/**
 * Why a match of tournament round `round` of the tournament `row` has
 * final results (ADR 0009): its tournament is complete, or its tournament
 * round is completed and not reopened since; null while they can change.
 * Round robin, which has no tournament rounds, is final only once the
 * tournament is complete.
 */
function finality(row: RoundStateRow, round: number): Finality | null {
  if (row.state === 'Complete') return 'tournament';
  return round <= row.lastCompletedRound ? 'round' : null;
}

/** The refusal of a change to a match whose results are final, `finality` saying why. */
function finalRefusal(finality: Finality, round: number): TournamentRefusal {
  return finality === 'tournament'
    ? {
        error: 'tournament-complete',
        message: 'This tournament is complete, so its results are final.',
      }
    : {
        error: 'round-completed',
        message: `Tournament round ${round} is completed, so its results are final.`,
      };
}

/**
 * Why a match of tournament round `round` of the tournament `row` has
 * final results, as finality decides, or null while they can change. The
 * message suits a player, as it suggests nothing only an organizer can do.
 */
export function finalResultsRefusal(
  row: RoundStateRow,
  round: number,
): TournamentRefusal | null {
  const final = finality(row, round);
  return final && finalRefusal(final, round);
}

/**
 * Why an organizer can't correct or clear a match of tournament round
 * `round` of the tournament `row`, or null when they can: when its results
 * are final, as finality decides. For the last completed round, while no
 * round is reopened, the refusal suggests Reopen round. Both the refusals
 * and the read's `correctable` come from here, so they can't disagree.
 */
export function correctionRefusal(
  row: RoundStateRow,
  round: number,
): TournamentRefusal | null {
  const final = finality(row, round);
  if (!final) return null;
  const refusal = finalRefusal(final, round);
  const reopenable =
    final === 'round' &&
    round === row.lastCompletedRound &&
    row.reopenedRound === null;
  return reopenable
    ? { ...refusal, message: `${refusal.message} Reopen it to change them.` }
    : refusal;
}
