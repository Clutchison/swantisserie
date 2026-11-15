import type { TournamentRefusal } from 'contract';
import type {
  MatchOutcomeKind,
  TournamentState,
} from '../generated/prisma/client.js';
import type { MatchChange } from './change-steps.js';
import {
  type CorrectionRow,
  finalResultsRefusal,
} from './correction-refusal.js';
import { NOT_PLAYING } from './tournament-errors.js';

/**
 * The rules of a match that both enforce a change and tell the web, through
 * the tournament read, what the change would allow (ADR 0007): who may
 * report or confirm it and what clearing it leaves.
 */

/** A player of a match as its rules read them. */
export interface MatchPlayer {
  userId: string;
  /** Whether they are a bot, which never reports or confirms (ADR 0008). */
  bot: boolean;
  dropped: boolean;
}

/** A match as its rules read it: its outcome and its players, in its order. */
interface MatchOfRules {
  players: readonly MatchPlayer[];
  outcome: MatchOutcomeKind;
}

/** Whether the draft's user `userId` is one of `match`'s players who isn't a bot. */
function isHumanPlayer(match: MatchOfRules, userId: string): boolean {
  return match.players.some(
    (player) => player.userId === userId && !player.bot,
  );
}

/**
 * Why the draft's user `userId` may not report `match`, of a tournament in
 * `state`; null when they may: one of its players, while the tournament
 * is playing and the match is unreported.
 */
export function reportRefusal(
  state: TournamentState,
  match: MatchOfRules,
  userId: string,
): TournamentRefusal | null {
  if (state !== 'Playing') return NOT_PLAYING;
  if (!isHumanPlayer(match, userId)) {
    return {
      error: 'not-your-match',
      message: 'Only a match’s own players can report it.',
    };
  }
  if (match.outcome !== 'Unreported') {
    return {
      error: 'match-reported',
      message: 'This match has been reported. Only an organizer can change it.',
    };
  }
  return null;
}

/**
 * Why the draft's user `userId` may not confirm `match` of the tournament
 * `row`; null when they may: one of its players, with a game score someone
 * else reported, while its results aren't final, as finalResultsRefusal
 * decides (ADR 0009).
 */
export function confirmRefusal(
  row: CorrectionRow,
  match: MatchOfRules & { round: number; reportedById: string | null },
  userId: string,
): TournamentRefusal | null {
  if (!isHumanPlayer(match, userId)) {
    return {
      error: 'not-your-match',
      message: 'Only a match’s own players can confirm it.',
    };
  }
  const final = finalResultsRefusal(row, match.round);
  if (final) return final;
  if (match.outcome !== 'GameScore') {
    return {
      error: 'not-reported',
      message: 'Only a reported game score can be confirmed.',
    };
  }
  if (match.reportedById === userId) {
    return {
      error: 'own-report',
      message: 'You reported this match. Your opponent confirms it.',
    };
  }
  return null;
}

/**
 * The change clearing a match, whose players in its order are `first` and
 * `second`, writes: the forfeit of one who has dropped, otherwise
 * unreported.
 */
export function clearing([first, second]: readonly MatchPlayer[]): MatchChange {
  const forfeitedBy = first.dropped
    ? ('First' as const)
    : second.dropped
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
