import type { TournamentRefusal } from 'contract';
import type { MatchOutcomeKind } from '../generated/prisma/client.js';
import type { MatchChange } from './change-steps.js';

/**
 * The rules of a match that both enforce a change and tell the web, through
 * the tournament read, what the change would allow (ADR 0007): who may
 * report or confirm it and what clearing it leaves.
 */

/**
 * A match as its rules read it: its players, in its order, `bots` saying
 * whether each is a bot, which never reports or confirms (ADR 0008).
 */
interface RuledMatch {
  players: readonly (string | undefined)[];
  bots: readonly boolean[];
  outcome: MatchOutcomeKind;
}

/**
 * Whether the draft's user `userId` is one of `match`'s players who may
 * act on it: not a bot.
 */
function actsIn(match: RuledMatch, userId: string): boolean {
  const index = match.players.indexOf(userId);
  return index >= 0 && !match.bots[index];
}

/**
 * Why the draft's user `userId` may not report `match`; null when they
 * may: one of its players, while it is unreported.
 */
export function reportRefusal(
  match: RuledMatch,
  userId: string,
): TournamentRefusal | null {
  if (!actsIn(match, userId)) {
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
 * Why the draft's user `userId` may not confirm `match`; null when they
 * may: one of its players, with a game score someone else reported.
 */
export function confirmRefusal(
  match: RuledMatch & { reportedById: string | null },
  userId: string,
): TournamentRefusal | null {
  if (!actsIn(match, userId)) {
    return {
      error: 'not-your-match',
      message: 'Only a match’s own players can confirm it.',
    };
  }
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
 * The change clearing a match writes, `dropped` saying whether each of its
 * players, in its order, has dropped: the forfeit of one who has,
 * otherwise unreported.
 */
export function clearing(dropped: readonly boolean[]): MatchChange {
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
