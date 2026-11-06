import type { CompleteRoundRequest, GameScore } from 'contract';
import type { ScheduledRound } from 'engine';
import type { TournamentState } from '../generated/prisma/client.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  InvalidTournamentRequestError,
  TournamentRefusedError,
} from './tournament-errors.js';

/** The tournament round Complete round is completing, and what it was asked. */
export interface RoundToSettle {
  tournamentId: string;
  round: number;
  /** Whether it is the tournament's final tournament round. */
  finalRound: boolean;
  request: Required<CompleteRoundRequest>;
}

/** What a format's round steps read of the tournament they change. */
export interface TournamentProgress {
  state: TournamentState;
  lastCompletedRound: number;
}

/** What starting and completing tournament rounds does that depends on the format. */
export interface RoundSteps {
  /** Makes tournament round 1 at Start, from `entryIds`, the joined entries in join order. */
  start(
    tx: Transaction,
    tournamentId: string,
    entryIds: readonly string[],
  ): Promise<void>;
  /** Settles the round's unreported matches, and any drops, before Complete round checks none is left. */
  settle(tx: Transaction, round: RoundToSettle): Promise<void>;
  /** How Complete round's refusal tells the organizer to settle `unreported` matches, after reporting them. */
  settleHint(unreported: number): string;
  /** Pairs tournament round `round`, the next. */
  pairNext(tx: Transaction, tournamentId: string, round: number): Promise<void>;
  /**
   * Throws TournamentRefusedError if an organizer can't correct the match
   * `matchId` to `games`, or clear it when `games` is null, beyond what
   * every format refuses. Formats without one allow both.
   */
  refuseChange?(
    tx: Transaction,
    tournament: TournamentProgress,
    matchId: string,
    games: GameScore | null,
  ): Promise<void>;
}

/** What a match's settling reads of each of its entries. */
export const ENTRY_OF_MATCH = {
  id: true,
  dropped: true,
  player: { select: { userId: true } },
} as const;

/**
 * The matches of tournament round `round` that Complete round's `listed`
 * name, each with what named it, in its order. Throws
 * InvalidTournamentRequestError if one isn't a match of the round; a bye is
 * no match.
 */
export async function listedMatches<Listed extends { matchId: string }>(
  tx: Transaction,
  tournamentId: string,
  round: number,
  listed: readonly Listed[],
) {
  const matches = await tx.match.findMany({
    where: { tournamentId, round, secondEntryId: { not: null } },
    select: {
      id: true,
      outcome: true,
      firstEntry: { select: ENTRY_OF_MATCH },
      secondEntry: { select: ENTRY_OF_MATCH },
    },
  });
  const byId = new Map(matches.map((match) => [match.id, match]));
  return listed.map((request) => {
    const match = byId.get(request.matchId);
    if (!match) {
      throw new InvalidTournamentRequestError(
        `Tournament round ${round} has no match ${request.matchId}.`,
      );
    }
    return {
      request,
      match: { ...match, entries: [match.firstEntry, match.secondEntry!] },
    };
  });
}

/**
 * Throws TournamentRefusedError if `match`, listed for a `grant` by
 * Complete round of tournament round `round`, was reported or forfeited
 * since the organizer looked.
 */
export function refuseSettledSince(
  match: { outcome: string },
  round: number,
  grant: 'granted draw' | 'granted win',
) {
  if (match.outcome === 'Unreported') return;
  throw new TournamentRefusedError({
    error: 'match-reported',
    message: `A match listed for a ${grant} has been ${match.outcome === 'Forfeit' ? 'forfeited' : 'reported'} since. Look at tournament round ${round} again before completing it.`,
  });
}

/** A match to make, whose players are tournament entry ids: a bye when the second is null. */
export interface NewMatch {
  players: readonly [string, string | null];
  /** Single elimination only: its bracket place in its tournament round. */
  bracketPlace?: number;
}

/** Makes the matches and byes of tournament round `round`. */
export async function createMatches(
  tx: Transaction,
  tournamentId: string,
  round: number,
  matches: readonly NewMatch[],
) {
  await tx.match.createMany({
    data: matches.map(
      ({ players: [firstEntryId, secondEntryId], bracketPlace }) => ({
        tournamentId,
        round,
        bracketPlace,
        firstEntryId,
        secondEntryId,
      }),
    ),
  });
}

/** Makes the matches and byes of `rounds`, whose players are tournament entry ids. */
export async function createRounds(
  tx: Transaction,
  tournamentId: string,
  rounds: readonly ({ round: number } & ScheduledRound)[],
) {
  for (const { round, matches, bye } of rounds) {
    await createMatches(tx, tournamentId, round, [
      ...matches.map((players) => ({ players })),
      ...(bye ? [{ players: [bye, null] as const }] : []),
    ]);
  }
}
