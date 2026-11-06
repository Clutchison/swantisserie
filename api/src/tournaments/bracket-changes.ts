import { dependentBracketPlaces } from 'engine';
import type { Transaction } from '../drafts/draft-shapes.js';
import type { ChangeSteps } from './change-steps.js';
import type { TournamentProgress } from './round-steps.js';
import { bracketRoundCount } from './single-elimination.js';
import { TournamentRefusedError } from './tournament-errors.js';

/**
 * Single elimination's change steps: a player can't be reinstated once a
 * forfeit or bye of theirs has fed a later match.
 */
export const SINGLE_ELIMINATION_CHANGES: ChangeSteps = {
  refuseReinstate: refuseBracketReinstate,
};

/**
 * Throws TournamentRefusedError if the dropped entry `entryId`'s last
 * match, or bye, was a forfeit or a bye that has fed the next tournament
 * round: its round is completed, or the next match it feeds is paired.
 * Their forfeit sent their opponent on, or nobody advanced from it, and
 * the bracket was paired so. A player out on a match they played can be
 * reinstated, which changes nothing in the bracket.
 */
async function refuseBracketReinstate(
  tx: Transaction,
  tournament: TournamentProgress,
  entryId: string,
) {
  const last = await tx.match.findFirst({
    where: {
      tournamentId: tournament.id,
      OR: [{ firstEntryId: entryId }, { secondEntryId: entryId }],
    },
    orderBy: { round: 'desc' },
    select: {
      round: true,
      bracketPlace: true,
      secondEntryId: true,
      outcome: true,
    },
  });
  if (!last) return;
  const bye = last.secondEntryId === null;
  if (!bye && last.outcome !== 'Forfeit') return;
  const [next] = dependentBracketPlaces(
    { round: last.round, bracketPlace: last.bracketPlace! },
    await bracketRoundCount(tx, tournament.id),
  );
  const fedNext =
    last.round <= tournament.lastCompletedRound ||
    (next !== undefined &&
      (await tx.match.count({
        where: { tournamentId: tournament.id, ...next },
      })) > 0);
  if (!fedNext) return;
  throw new TournamentRefusedError({
    error: 'paired-since-drop',
    message: `That player can’t be reinstated: their ${bye ? 'bye' : 'forfeit'} in tournament round ${last.round} has fed tournament round ${last.round + 1}.`,
  });
}
