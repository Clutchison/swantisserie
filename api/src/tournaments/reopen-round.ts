import type { ReopenRoundView, TournamentRefusal } from 'contract';
import type { Transaction } from '../drafts/draft-shapes.js';
import { TournamentRefusedError } from './tournament-errors.js';
import { takeBackDrops } from './tournament-matches.js';
import type { TournamentRow } from './tournament-view.js';

/** What Reopen round reads of a tournament, a part of what its read does. */
type ReopenRow = Pick<
  TournamentRow,
  | 'format'
  | 'state'
  | 'lastCompletedRound'
  | 'reopenedRound'
  | 'entries'
  | 'matches'
>;

/**
 * Reopen round of the tournament `row`'s last completed tournament round,
 * N: why it would be refused, if it would, and the players whose drops it
 * takes back. It is refused in round robin, outside play, before any round
 * is completed, while a reopened round hasn't been completed again, so
 * only one round is ever reopened, and once a match of round N + 1 has a
 * game score. Forfeits and byes don't refuse it. It takes back every drop
 * made in completing round N or since.
 */
export function reopenRoundOf(row: ReopenRow): ReopenRoundView {
  const round = row.lastCompletedRound;
  return {
    round,
    refusal: refusalOf(row),
    takesBackDrops: row.entries
      .filter((entry) => takesBack(entry, round))
      .map((entry) => entry.player.userId),
  };
}

/**
 * Whether the tournament `row`'s read offers Reopen round to organizers:
 * in Swiss and single elimination, while it is playing and at least one
 * tournament round is completed.
 */
export function offersReopenRound(row: ReopenRow): boolean {
  return (
    row.format !== 'RoundRobin' &&
    row.state === 'Playing' &&
    row.lastCompletedRound > 0
  );
}

function refusalOf(row: ReopenRow): TournamentRefusal | null {
  const round = row.lastCompletedRound;
  if (row.format === 'RoundRobin') {
    return {
      error: 'wrong-format',
      message: 'A round robin tournament has no tournament rounds to reopen.',
    };
  }
  if (row.state === 'Complete') {
    return {
      error: 'tournament-complete',
      message: 'This tournament is complete, so its results are final.',
    };
  }
  if (row.state !== 'Playing') {
    return {
      error: 'not-playing',
      message: 'This tournament isn’t being played.',
    };
  }
  if (round === 0) {
    return {
      error: 'no-completed-round',
      message: 'No tournament round has been completed yet.',
    };
  }
  if (row.reopenedRound !== null) {
    return {
      error: 'round-reopened',
      message: `Tournament round ${row.reopenedRound} was reopened. Complete it again before reopening tournament round ${round}.`,
    };
  }
  const reported = row.matches.filter(
    (match) => match.round === round + 1 && match.outcome === 'GameScore',
  ).length;
  if (reported > 0) {
    return {
      error: 'next-round-reported',
      message: `Tournament round ${round + 1} has ${reported === 1 ? 'a match' : `${reported} matches`} with a game score. Clear ${reported === 1 ? 'it' : 'them'} before reopening tournament round ${round}.`,
    };
  }
  return null;
}

/** Whether reopening tournament round `round` takes back `entry`'s drop: one made in completing it or since. */
function takesBack(
  entry: { dropped: boolean; droppedAfterRound: number | null },
  round: number,
): boolean {
  return (
    entry.dropped &&
    entry.droppedAfterRound !== null &&
    entry.droppedAfterRound >= round
  );
}

/**
 * Reopens the tournament `tournamentId`'s last completed tournament round,
 * as `row`, the tournament as it reads it, allows, undoing what completing
 * it did and what has happened since: round N + 1's matches, forfeits and
 * byes are removed, to be paired again when round N is completed again;
 * round N's granted draws and granted wins are unreported again; the drops
 * made in completing it or since are taken back, as Reinstate does it; and
 * its results leave the standings, as the last completed round is N − 1.
 * Throws TournamentRefusedError as reopenRoundOf refuses it.
 */
export async function reopenRound(
  tx: Transaction,
  tournamentId: string,
  row: ReopenRow,
): Promise<void> {
  const { round, refusal } = reopenRoundOf(row);
  if (refusal) throw new TournamentRefusedError(refusal);
  await tx.match.deleteMany({ where: { tournamentId, round: round + 1 } });
  await tx.match.updateMany({
    where: {
      tournamentId,
      round,
      outcome: { in: ['GrantedDraw', 'GrantedWin'] },
    },
    data: { outcome: 'Unreported', grantedTo: null },
  });
  await takeBackDrops(
    tx,
    tournamentId,
    row.entries.filter((entry) => takesBack(entry, round)).map((e) => e.id),
  );
  await tx.tournament.update({
    where: { id: tournamentId },
    data: { lastCompletedRound: round - 1, reopenedRound: round },
  });
}
