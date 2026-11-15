import type { TournamentRefusal } from 'contract';
import { dependentBracketPlaces, singleEliminationRoundCount } from 'engine';
import type { ChangeSteps, ReinstateRow } from './change-steps.js';

/**
 * Single elimination's change steps: a player can't be reinstated once a
 * forfeit or bye of theirs has fed a later match.
 */
export const SINGLE_ELIMINATION_CHANGES: ChangeSteps = {
  reinstateRefusal: bracketReinstateRefusal,
};

/**
 * Why the dropped entry `entryId` of the single elimination tournament
 * `row` can't be reinstated: their last match, or bye, was a forfeit or a
 * bye that has fed the next tournament round, as its round is completed or
 * the next match it feeds is paired. Their forfeit sent their opponent on,
 * or nobody advanced from it, and the bracket was paired so. Null for a
 * player out on a match they played, whose reinstating changes nothing in
 * the bracket, and while their forfeit or bye has fed nothing yet.
 */
function bracketReinstateRefusal(
  row: ReinstateRow,
  entryId: string,
): TournamentRefusal | null {
  const last = row.matches
    .filter(
      (match) =>
        match.firstEntryId === entryId || match.secondEntryId === entryId,
    )
    .reduce<ReinstateRow['matches'][number] | null>(
      (latest, match) =>
        latest === null || match.round > latest.round ? match : latest,
      null,
    );
  if (!last) return null;
  const bye = last.secondEntryId === null;
  if (!bye && last.outcome !== 'Forfeit') return null;
  const [next] = dependentBracketPlaces(
    { round: last.round, bracketPlace: last.bracketPlace! },
    singleEliminationRoundCount(row.entries.length),
  );
  const fedNext =
    last.round <= row.lastCompletedRound ||
    (next !== undefined &&
      row.matches.some(
        (match) =>
          match.round === next.round &&
          match.bracketPlace === next.bracketPlace,
      ));
  if (!fedNext) return null;
  return {
    error: 'paired-since-drop',
    message: `That player can’t be reinstated: their ${bye ? 'bye' : 'forfeit'} in tournament round ${last.round} has fed tournament round ${last.round + 1}.`,
  };
}
