import { Injectable } from '@nestjs/common';
import type { CompleteRoundRequest } from 'contract';
import { roundCompletion } from 'engine';
import type { TournamentFormat } from '../generated/prisma/client.js';
import type { DraftEvent } from '../drafts/draft-events.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import { SINGLE_ELIMINATION_CHANGES } from './bracket-changes.js';
import { DEFAULT_CHANGE_STEPS, type ChangeSteps } from './change-steps.js';
import { reopenRound } from './reopen-round.js';
import { ROUND_STEPS, type RoundSteps } from './round-steps.js';
import { forfeitUnplayed, takeBackDrops } from './tournament-matches.js';
import { roundCompletedOrTournamentCompleted } from './tournament-events.js';
import { TournamentRefusedError } from './tournament-errors.js';
import { entryOf, TournamentLock } from './tournament-lock.js';
import { roundCount, TOURNAMENT_VIEW } from './tournament-view.js';

/**
 * A playing tournament's progress: completing it or its tournament rounds,
 * reopening a completed round, and players dropping and being reinstated.
 * Every change runs under the draft's lock.
 */
@Injectable()
export class TournamentProgressionService {
  constructor(private readonly lock: TournamentLock) {}

  /**
   * Completes the draft's round robin tournament: every unreported match
   * becomes a granted draw, and every deck unlocks. Throws
   * TournamentRefusedError if it isn't playing, or plays one tournament
   * round at a time, completing with its final one. Returns its
   * announcement.
   */
  async complete(draftId: string): Promise<DraftEvent[]> {
    return this.lock.inPlay(draftId, async (tx, tournament) => {
      if (tournament.format !== 'RoundRobin') {
        throw new TournamentRefusedError({
          error: 'wrong-format',
          message:
            'This tournament completes when its final tournament round is completed.',
        });
      }
      await tx.match.updateMany({
        where: {
          tournamentId: tournament.id,
          outcome: 'Unreported',
          secondEntryId: { not: null },
        },
        data: { outcome: 'GrantedDraw' },
      });
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { state: 'Complete' },
      });
      return [
        await roundCompletedOrTournamentCompleted(tx, draftId, tournament.id),
      ];
    });
  }

  /**
   * Completes the current tournament round of the draft's tournament, in a
   * format that plays one tournament round at a time. Its format's round
   * steps first decide the round as `request` asks; the round must
   * then have no unreported match. It then completes the tournament, which
   * unlocks every deck, when the engine's roundCompletion says completing
   * the round does: after the final tournament round, or with too few
   * players left. Otherwise it has the format pair the next tournament
   * round. A completed round stays
   * completed. Throws as the format's round steps do, and
   * TournamentRefusedError if the tournament isn't playing, the round has
   * an unreported match, or it is round robin, which has no tournament
   * rounds. Returns its announcement: the next tournament round's pairings,
   * or the tournament ending.
   */
  async completeRound(
    draftId: string,
    request: Required<CompleteRoundRequest>,
  ): Promise<DraftEvent[]> {
    return this.lock.inPlay(draftId, async (tx, tournament) => {
      const steps = ROUND_STEPS[tournament.format];
      if (!steps) {
        throw new TournamentRefusedError({
          error: 'wrong-format',
          message:
            'A round robin tournament has no tournament rounds to complete. Complete the tournament instead.',
        });
      }
      const round = tournament.lastCompletedRound + 1;
      const joined = await tx.tournamentEntry.count({
        where: { tournamentId: tournament.id },
      });
      const roundTotal = roundCount(tournament, joined);
      const finalRound = round >= roundTotal;
      await steps.decide(tx, {
        tournamentId: tournament.id,
        round,
        finalRound,
        request,
      });
      await refuseUnreported(tx, tournament.id, round, steps);
      const { completes } = roundCompletion(
        await steps.completionInput(tx, tournament.id, round, roundTotal),
      );
      await tx.tournament.update({
        where: { id: tournament.id },
        data: {
          lastCompletedRound: round,
          reopenedRound: null,
          ...(completes && { state: 'Complete' }),
        },
      });
      if (!completes) await steps.pairNext(tx, tournament.id, round + 1);
      return [
        await roundCompletedOrTournamentCompleted(tx, draftId, tournament.id),
      ];
    });
  }

  /**
   * Drops the draft's player `userId` from its tournament: every unplayed
   * match of theirs becomes a forfeit by them, and their played matches
   * stand. Their deck stays locked. Throws TournamentRefusedError if they
   * haven't joined, are a bot or have dropped already, or the tournament
   * isn't playing.
   */
  async drop(draftId: string, userId: string): Promise<void> {
    await this.lock.inPlay(draftId, async (tx, tournament) => {
      const entry = await entryOf(tx, tournament, draftId, userId);
      if (entry.dropped) {
        throw new TournamentRefusedError({
          error: 'already-dropped',
          message: 'That player has already dropped.',
        });
      }
      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: {
          dropped: true,
          droppedAfterRound: tournament.lastCompletedRound,
        },
      });
      await forfeitUnplayed(tx, entry.id);
    });
  }

  /**
   * Reinstates the draft's dropped player `userId`: their forfeits
   * become unreported matches again, except against an opponent who has
   * dropped too, whose forfeit they become. Throws TournamentRefusedError if
   * they haven't joined, are a bot or haven't dropped, the tournament isn't
   * playing, or their drop has fed a later pairing, as their format's round
   * steps decide, by default once a tournament round was paired without
   * them.
   */
  async reinstate(draftId: string, userId: string): Promise<void> {
    await this.lock.inPlay(draftId, async (tx, tournament) => {
      const entry = await entryOf(tx, tournament, draftId, userId);
      if (!entry.dropped) {
        throw new TournamentRefusedError({
          error: 'not-dropped',
          message: 'That player hasn’t dropped.',
        });
      }
      await CHANGE_STEPS[tournament.format].refuseReinstate(
        tx,
        tournament,
        entry.id,
      );
      await takeBackDrops(tx, tournament.id, [entry.id]);
    });
  }

  /**
   * Reopens the last completed tournament round of the draft's Swiss or
   * single elimination tournament, as reopenRound in reopen-round.ts does,
   * so its results can be corrected or cleared again. Throws
   * TournamentRefusedError as that refuses it. Posts no announcement.
   */
  async reopenRound(draftId: string): Promise<void> {
    await this.lock.withTournament(draftId, async (tx, tournament) => {
      const row = await tx.tournament.findUniqueOrThrow({
        where: { id: tournament.id },
        select: TOURNAMENT_VIEW,
      });
      await reopenRound(tx, tournament.id, row);
    });
  }
}

/** Each format's change steps: single elimination's own, the default's otherwise. */
const CHANGE_STEPS: Record<TournamentFormat, ChangeSteps> = {
  RoundRobin: DEFAULT_CHANGE_STEPS,
  Swiss: DEFAULT_CHANGE_STEPS,
  SingleElimination: SINGLE_ELIMINATION_CHANGES,
};

/**
 * Throws TournamentRefusedError if tournament round `round` of the
 * tournament `tournamentId` has an unreported match, telling the organizer
 * to decide it as its format’s `steps` do.
 */
async function refuseUnreported(
  tx: Transaction,
  tournamentId: string,
  round: number,
  steps: RoundSteps,
) {
  const unreported = await tx.match.count({
    where: {
      tournamentId,
      round,
      outcome: 'Unreported',
      secondEntryId: { not: null },
    },
  });
  if (unreported > 0) {
    throw new TournamentRefusedError({
      error: 'unreported-matches',
      message: `Tournament round ${round} has ${unreported} unreported ${unreported === 1 ? 'match' : 'matches'}. Report ${unreported === 1 ? 'it' : 'them'}, or ${steps.decideHint(unreported)}, before completing the tournament round.`,
    });
  }
}
