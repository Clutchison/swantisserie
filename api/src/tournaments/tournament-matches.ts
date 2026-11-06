import type { ScheduledRound } from 'engine';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  BOT_ENTRY,
  InvalidTournamentRequestError,
  TournamentRefusedError,
} from './tournament-errors.js';

/** What deciding a match reads of each of its entries. */
export const ENTRY_OF_MATCH = {
  id: true,
  dropped: true,
  player: { select: { userId: true, user: { select: { isBot: true } } } },
} as const;

/**
 * The entry of `match`'s player `playerId`, for Complete round to drop.
 * Throws InvalidTournamentRequestError, saying `notInMatch`, if they aren't
 * one of its players, and TournamentRefusedError if they are a bot, which
 * never drops.
 */
export function entryToDrop<
  Entry extends { player: { userId: string; user: { isBot: boolean } } },
>(match: { entries: Entry[] }, playerId: string, notInMatch: string): Entry {
  const entry = match.entries.find((e) => e.player.userId === playerId);
  if (!entry) throw new InvalidTournamentRequestError(notInMatch);
  if (entry.player.user.isBot) throw new TournamentRefusedError(BOT_ENTRY);
  return entry;
}

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
export function refuseReportedSince(
  match: { outcome: string },
  round: number,
  grant: 'granted draw' | 'granted win' | 'drop',
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

/** Turns every unplayed match of the entry `entryId`, byes aside, into a forfeit by it. */
export async function forfeitUnplayed(tx: Transaction, entryId: string) {
  await tx.match.updateMany({
    where: {
      firstEntryId: entryId,
      secondEntryId: { not: null },
      outcome: 'Unreported',
    },
    data: { outcome: 'Forfeit', forfeitedBy: 'First' },
  });
  await tx.match.updateMany({
    where: { secondEntryId: entryId, outcome: 'Unreported' },
    data: { outcome: 'Forfeit', forfeitedBy: 'Second' },
  });
}

/**
 * Takes back the drops of the dropped entries `entryIds`, as Reinstate
 * does: their forfeits become unreported matches again, except against an
 * entry of the tournament `tournamentId` still dropped, whose forfeits
 * they become.
 */
export async function takeBackDrops(
  tx: Transaction,
  tournamentId: string,
  entryIds: readonly string[],
) {
  if (entryIds.length === 0) return;
  await tx.tournamentEntry.updateMany({
    where: { id: { in: [...entryIds] } },
    data: { dropped: false, droppedAfterRound: null },
  });
  await tx.match.updateMany({
    where: {
      outcome: 'Forfeit',
      OR: [
        { firstEntryId: { in: [...entryIds] }, forfeitedBy: 'First' },
        { secondEntryId: { in: [...entryIds] }, forfeitedBy: 'Second' },
      ],
    },
    data: {
      outcome: 'Unreported',
      forfeitedBy: null,
      reportedById: null,
      confirmed: false,
    },
  });
  const stillDropped = await tx.tournamentEntry.findMany({
    where: { tournamentId, dropped: true },
    select: { id: true },
  });
  for (const other of stillDropped) await forfeitUnplayed(tx, other.id);
}

/** The tournament's entries as the engine's roundCompletion reads them: by entry id, whether each has dropped. */
export async function completingEntries(tx: Transaction, tournamentId: string) {
  const entries = await tx.tournamentEntry.findMany({
    where: { tournamentId },
    select: { id: true, dropped: true },
  });
  return entries.map(({ id, dropped }) => ({ playerId: id, dropped }));
}
