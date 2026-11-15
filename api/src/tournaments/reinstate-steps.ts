import type { TournamentRefusal } from 'contract';
import type { Prisma, TournamentFormat } from '../generated/prisma/client.js';
import { SINGLE_ELIMINATION_REINSTATE } from './bracket-reinstate.js';
import { NOT_PLAYING } from './tournament-errors.js';
import { droppable, hasEntry } from './tournament-matches.js';

/**
 * What Reinstate's rule reads of a tournament, a part of what its read
 * selects: its format, state and last completed tournament round, its
 * entries and its matches, byes included.
 */
export const REINSTATE_VIEW = {
  format: true,
  state: true,
  lastCompletedRound: true,
  entries: {
    select: {
      id: true,
      dropped: true,
      player: { select: { user: { select: { isBot: true } } } },
    },
  },
  matches: {
    select: {
      round: true,
      bracketPlace: true,
      firstEntryId: true,
      secondEntryId: true,
      outcome: true,
    },
  },
} satisfies Prisma.TournamentSelect;

/** A tournament as Reinstate's rule reads it; the tournament read's row is one. */
export type ReinstateRow = Prisma.TournamentGetPayload<{
  select: typeof REINSTATE_VIEW;
}>;

/** A match or bye of a tournament as Reinstate's rule reads it. */
export type ReinstateMatch = ReinstateRow['matches'][number];

/**
 * What Reinstate does that depends on the format: when it's refused.
 * DEFAULT_REINSTATE_STEPS are round robin's and Swiss's.
 */
export interface ReinstateSteps {
  /**
   * Why the dropped entry `entryId` of the tournament `row` can't be
   * reinstated, as their drop has fed a later pairing; null if it hasn't.
   */
  reinstateRefusal(
    row: ReinstateRow,
    entryId: string,
  ): TournamentRefusal | null;
}

/**
 * The Reinstate steps of the formats whose matches don't feed one another:
 * a player can't be reinstated once a tournament round has been paired
 * without them.
 */
export const DEFAULT_REINSTATE_STEPS: ReinstateSteps = {
  reinstateRefusal(row, entryId) {
    const pairedWithout = currentRoundWithout(row.matches, entryId);
    if (pairedWithout === null) return null;
    return {
      error: 'paired-since-drop',
      message: `That player can’t be reinstated: tournament round ${pairedWithout} was paired after they dropped.`,
    };
  },
};

/**
 * Each format's Reinstate steps: single elimination's own, the default's
 * otherwise. They live here, not beside ROUND_STEPS in format-steps.ts,
 * because the tournament read asks them, and format-steps.ts imports
 * single-elimination.ts, which imports the read: a cycle.
 */
export const REINSTATE_STEPS: Record<TournamentFormat, ReinstateSteps> = {
  RoundRobin: DEFAULT_REINSTATE_STEPS,
  Swiss: DEFAULT_REINSTATE_STEPS,
  SingleElimination: SINGLE_ELIMINATION_REINSTATE,
};

/**
 * Why Reinstate of the entry `entryId` of the tournament `row` would be
 * refused now, as both the Reinstate write and the tournament read ask:
 * outside play, or as the format's Reinstate steps refuse it. Null for an
 * entry that hasn't dropped or can't be (a bot), which the write refuses
 * before asking, worded for who asks, and for one Reinstate would accept.
 */
export function reinstateRefusalOf(
  row: ReinstateRow,
  entryId: string,
): TournamentRefusal | null {
  const entry = row.entries.find((entered) => entered.id === entryId);
  if (!entry?.dropped || !droppable(entry)) return null;
  if (row.state !== 'Playing') return NOT_PLAYING;
  return REINSTATE_STEPS[row.format].reinstateRefusal(row, entryId);
}

/**
 * The number of the current tournament round, the latest paired, if the
 * entry `entryId` has neither a match nor a bye in it among `matches`: for
 * a dropped player, a round paired after their drop, which their forfeits
 * or drop fed. Null while they are in the current round, as round robin's
 * players always are, and before any round is paired.
 */
function currentRoundWithout(
  matches: readonly ReinstateMatch[],
  entryId: string,
): number | null {
  if (matches.length === 0) return null;
  const round = Math.max(...matches.map((match) => match.round));
  const seated = matches.some(
    (match) => match.round === round && hasEntry(match, entryId),
  );
  return seated ? null : round;
}
