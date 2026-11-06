import { Injectable } from '@nestjs/common';
import type { GameScore } from 'contract';
import { reportProblem } from 'engine';
import type { MatchChange } from './change-steps.js';
import { TournamentRefusedError } from './tournament-errors.js';
import {
  findMatch,
  type LockedTournament,
  TournamentLock,
} from './tournament-lock.js';

/**
 * A playing or complete tournament's match results: players reporting and
 * confirming game scores, and organizers correcting or clearing them. Every
 * change runs under the draft's lock.
 */
@Injectable()
export class TournamentResultsService {
  constructor(private readonly lock: TournamentLock) {}

  /**
   * Reports the match `matchId`'s game score, `games` in its player order,
   * as the draft's user `userId`, one of its players. Throws NoMatchError
   * if the tournament has no such match, and TournamentRefusedError if the
   * user isn't one of its players, it is reported already, the game score
   * isn't 2–0 or 2–1 for either side, or the tournament isn't playing.
   */
  async report(
    draftId: string,
    matchId: string,
    userId: string,
    games: GameScore,
  ): Promise<void> {
    await this.lock.inPlay(draftId, async (tx, tournament) => {
      const match = await findMatch(tx, tournament.id, matchId);
      if (!match.players.includes(userId)) {
        throw new TournamentRefusedError({
          error: 'not-your-match',
          message: 'Only a match’s own players can report it.',
        });
      }
      if (match.outcome !== 'Unreported') {
        throw new TournamentRefusedError({
          error: 'match-reported',
          message:
            'This match has been reported. Only an organizer can change it.',
        });
      }
      const problem = reportProblem(games);
      if (problem) throw new TournamentRefusedError(problem);
      await tx.match.update({
        where: { id: matchId },
        data: gameScoreChange(games, userId),
      });
    });
  }

  /**
   * Confirms the match `matchId`'s game score as the draft's user `userId`:
   * a player of it who didn't report it. Throws NoMatchError if the
   * tournament has no such match, and TournamentRefusedError if the user
   * isn't one of its players, reported it, or it has no reported game
   * score. A match can be confirmed while the tournament is playing or once
   * it is complete.
   */
  async confirm(
    draftId: string,
    matchId: string,
    userId: string,
  ): Promise<void> {
    await this.lock.withTournament(draftId, async (tx, tournament) => {
      const match = await findMatch(tx, tournament.id, matchId);
      if (!match.players.includes(userId)) {
        throw new TournamentRefusedError({
          error: 'not-your-match',
          message: 'Only a match’s own players can confirm it.',
        });
      }
      if (match.outcome !== 'GameScore') {
        throw new TournamentRefusedError({
          error: 'not-reported',
          message: 'Only a reported game score can be confirmed.',
        });
      }
      if (match.reportedById === userId) {
        throw new TournamentRefusedError({
          error: 'own-report',
          message: 'You reported this match. Your opponent confirms it.',
        });
      }
      await tx.match.update({
        where: { id: matchId },
        data: { confirmed: true },
      });
    });
  }

  /**
   * Sets the match `matchId`'s game score, `games` in its player order, as
   * an organizer, the draft's user `userId`, does: reporting it for its
   * players or correcting it, while its tournament round is open, or in
   * round robin while the tournament is playing. The opponent hasn't
   * agreed to it, so it is unconfirmed. Throws NoMatchError if the
   * tournament has no such match, and TournamentRefusedError if its
   * results are final, as refuseFinal decides, or the game score isn't 2–0
   * or 2–1 for either side.
   */
  async setGameScore(
    draftId: string,
    matchId: string,
    userId: string,
    games: GameScore,
  ): Promise<void> {
    await this.lock.withTournament(draftId, async (tx, tournament) => {
      const match = await findMatch(tx, tournament.id, matchId);
      refuseFinal(tournament, match.round);
      const problem = reportProblem(games);
      if (problem) throw new TournamentRefusedError(problem);
      await tx.match.update({
        where: { id: matchId },
        data: gameScoreChange(games, userId),
      });
    });
  }

  /**
   * Clears the match `matchId`'s game score, granted draw, granted win or
   * forfeit, as an organizer does, when they could correct it: a match one
   * of whose players has dropped is their forfeit again, as reinstating a
   * player leaves a match against a player still dropped; otherwise it is
   * unreported again. Throws NoMatchError if the tournament has no such
   * match, and TournamentRefusedError if its results are final, as
   * refuseFinal decides.
   */
  async clearGameScore(draftId: string, matchId: string): Promise<void> {
    await this.lock.withTournament(draftId, async (tx, tournament) => {
      const match = await findMatch(tx, tournament.id, matchId);
      refuseFinal(tournament, match.round);
      await tx.match.update({
        where: { id: matchId },
        data: clearing(match.dropped),
      });
    });
  }
}

/**
 * Throws TournamentRefusedError if a match of tournament round `round` has
 * final results, which an organizer can't correct or clear: every match
 * once the tournament is complete, and the matches of a completed
 * tournament round, until it is reopened, which its refusal suggests for
 * the last completed round while no round is reopened. Neither a tournament in
 * registration, which has no matches, nor a playing round robin one,
 * which has no tournament rounds, has any.
 */
function refuseFinal(tournament: LockedTournament, round: number) {
  if (tournament.state === 'Complete') {
    throw new TournamentRefusedError({
      error: 'tournament-complete',
      message: 'This tournament is complete, so its results are final.',
    });
  }
  if (round > tournament.lastCompletedRound) return;
  throw new TournamentRefusedError({
    error: 'round-completed',
    message:
      round === tournament.lastCompletedRound &&
      tournament.reopenedRound === null
        ? `Tournament round ${round} is completed, so its results are final. Reopen it to change them.`
        : `Tournament round ${round} is completed, so its results are final.`,
  });
}

/**
 * The change writing the game score `games` as the user `userId`, whether
 * a player reports it or an organizer sets it: unconfirmed, as the
 * opponent hasn't agreed to it.
 */
function gameScoreChange(games: GameScore, userId: string): MatchChange {
  return {
    outcome: 'GameScore',
    firstGames: games[0],
    secondGames: games[1],
    drawnGames: 0,
    forfeitedBy: null,
    grantedTo: null,
    reportedById: userId,
    confirmed: false,
  };
}

/**
 * The change clearing a match writes, `dropped` saying whether each of its
 * players, in its order, has dropped: the forfeit of one who has,
 * otherwise unreported.
 */
function clearing(dropped: readonly boolean[]): MatchChange {
  const forfeitedBy = dropped[0]
    ? ('First' as const)
    : dropped[1]
      ? ('Second' as const)
      : null;
  return {
    outcome: forfeitedBy ? 'Forfeit' : 'Unreported',
    firstGames: 0,
    secondGames: 0,
    drawnGames: 0,
    forfeitedBy,
    grantedTo: null,
    reportedById: null,
    confirmed: false,
  };
}
