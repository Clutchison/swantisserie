import type { GameScorePreview } from 'contract';
import type {
  MatchOutcomeKind,
  MatchSide,
} from '../generated/prisma/client.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import type { TournamentProgress } from './round-steps.js';
import { TournamentRefusedError } from './tournament-errors.js';

/**
 * What an organizer's correction or clear writes to a match: its new
 * outcome, every field only another outcome uses back to its default.
 */
export interface MatchChange {
  outcome: MatchOutcomeKind;
  firstGames: number;
  secondGames: number;
  drawnGames: number;
  forfeitedBy: MatchSide | null;
  grantedTo: null;
  reportedById: string | null;
  confirmed: false;
}

/**
 * What an organizer's corrections, clears and reinstatements do that
 * depends on the format. DEFAULT_CHANGE_STEPS are round robin's and
 * Swiss's.
 */
export interface ChangeSteps {
  /**
   * Whether clearing a match of a completed tournament round reopens that
   * round, the match unreported, rather than making it a granted draw; and
   * whether a dropped player's match is their forfeit again whatever the
   * tournament's state, rather than only while it is playing.
   */
  reopensCleared: boolean;
  /** Writes an organizer's `change` to the match `matchId`, and changes what depends on it. */
  changeMatch(
    tx: Transaction,
    tournament: TournamentProgress,
    matchId: string,
    change: MatchChange,
  ): Promise<void>;
  /** What `changeMatch` would do beyond the match for the same change, writing nothing. */
  previewChange(
    tx: Transaction,
    tournament: TournamentProgress,
    matchId: string,
    change: MatchChange,
  ): Promise<GameScorePreview>;
  /**
   * Throws TournamentRefusedError if the dropped entry `entryId` can't be
   * reinstated, as their drop has fed a later pairing.
   */
  refuseReinstate(
    tx: Transaction,
    tournament: TournamentProgress,
    entryId: string,
  ): Promise<void>;
}

/**
 * The change steps of the formats whose matches don't feed one another:
 * a change writes just its match, so it previews nothing, and a player
 * can't be reinstated once a tournament round has been paired without them.
 */
export const DEFAULT_CHANGE_STEPS: ChangeSteps = {
  reopensCleared: false,
  async changeMatch(tx, _tournament, matchId, change) {
    await tx.match.update({ where: { id: matchId }, data: change });
  },
  previewChange: (_tx, tournament) =>
    Promise.resolve({ clears: [], state: tournament.state }),
  async refuseReinstate(tx, tournament, entryId) {
    const pairedWithout = await currentRoundWithout(tx, tournament.id, entryId);
    if (pairedWithout === null) return;
    throw new TournamentRefusedError({
      error: 'paired-since-drop',
      message: `That player can’t be reinstated: tournament round ${pairedWithout} was paired after they dropped.`,
    });
  },
};

/**
 * The number of the current tournament round, the latest paired, if the
 * entry `entryId` has neither a match nor a bye in it: for a dropped
 * player, a round paired after their drop, which their forfeits or drop
 * fed. Null while they are in the current round, as round robin's players
 * always are.
 */
async function currentRoundWithout(
  tx: Transaction,
  tournamentId: string,
  entryId: string,
): Promise<number | null> {
  const current = await tx.match.aggregate({
    where: { tournamentId },
    _max: { round: true },
  });
  const round = current._max.round;
  if (round === null) return null;
  const seated = await tx.match.count({
    where: {
      tournamentId,
      round,
      OR: [{ firstEntryId: entryId }, { secondEntryId: entryId }],
    },
  });
  return seated === 0 ? round : null;
}
