import { Injectable } from '@nestjs/common';
import type { GameScore } from 'contract';
import { reportProblem } from 'engine';
import type { MatchChange } from './change-steps.js';
import { correctionRefusal } from './correction-refusal.js';
import { clearing, confirmRefusal } from './match-rules.js';
import { TournamentRefusedError } from './tournament-errors.js';
import {
  findMatch,
  type LockedTournament,
  TournamentLock,
} from './tournament-lock.js';

/**
 * A playing or complete tournament's match results: players reporting and
 * confirming game scores, and organizers correcting or clearing them.
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
      const refusal = confirmRefusal(match, userId);
      if (refusal) throw new TournamentRefusedError(refusal);
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
 * final results, which an organizer can't correct or clear, as
 * correctionRefusal decides.
 */
function refuseFinal(tournament: LockedTournament, round: number) {
  const refusal = correctionRefusal(tournament, round);
  if (refusal) throw new TournamentRefusedError(refusal);
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
