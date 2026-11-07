import { Injectable } from '@nestjs/common';
import type { TournamentRefusal } from 'contract';
import type {
  SwissRoundOption,
  TournamentFormat,
  TournamentState,
} from '../generated/prisma/client.js';
import { DraftGoneError } from '../drafts/draft-errors.js';
import { DraftLock } from '../drafts/draft-lock.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import type { TournamentProgress } from './round-steps.js';
import { droppable, ENTRY_OF_MATCH } from './tournament-matches.js';
import {
  BOT_ENTRY,
  NoMatchError,
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';

/** What a change reads of the tournament it changes. */
export interface LockedTournament extends TournamentProgress {
  format: TournamentFormat;
  swissRoundOption: SwissRoundOption | null;
  reopenedRound: number | null;
}

const LOCKED_TOURNAMENT = {
  id: true,
  format: true,
  swissRoundOption: true,
  state: true,
  lastCompletedRound: true,
  reopenedRound: true,
} as const;

/** A change to a draft's tournament, run with the draft's row locked. */
type TournamentChange<T> = (
  tx: Transaction,
  tournament: LockedTournament,
) => Promise<T>;

/**
 * The draft's lock, as every change to its tournament runs under it. The
 * lock bumps the draft's version, so the controller's publish tells open
 * pages to re-read it.
 */
@Injectable()
export class TournamentLock {
  constructor(private readonly lock: DraftLock) {}

  /**
   * Runs `change` with the draft's row locked, if its tournament is in
   * registration. Throws NoTournamentError if it has none, and
   * TournamentRefusedError if it is past registration.
   */
  inRegistration<T>(draftId: string, change: TournamentChange<T>): Promise<T> {
    return this.whileTournamentIn(draftId, 'Registration', change, {
      error: 'not-in-registration',
      message: 'This tournament has started.',
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is
   * playing. Throws NoTournamentError if it has none, and
   * TournamentRefusedError if it isn't playing.
   */
  inPlay<T>(draftId: string, change: TournamentChange<T>): Promise<T> {
    return this.whileTournamentIn(draftId, 'Playing', change, {
      error: 'not-playing',
      message: 'This tournament isn’t being played.',
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is in
   * `state`. Throws NoTournamentError if it has none, and
   * TournamentRefusedError with `refusal` if it is in another state.
   */
  private whileTournamentIn<T>(
    draftId: string,
    state: TournamentState,
    change: TournamentChange<T>,
    refusal: TournamentRefusal,
  ): Promise<T> {
    return this.withTournament(draftId, async (tx, tournament) => {
      if (tournament.state !== state) {
        throw new TournamentRefusedError(refusal);
      }
      return change(tx, tournament);
    });
  }

  /**
   * Runs `change` with the draft's row locked, whatever state its
   * tournament is in. Throws NoTournamentError if it has none.
   */
  withTournament<T>(draftId: string, change: TournamentChange<T>): Promise<T> {
    return this.lock.run(draftId, async (draft) => {
      if (!draft) throw new DraftGoneError();
      const tournament = await draft.tx.tournament.findUnique({
        where: { draftId },
        select: LOCKED_TOURNAMENT,
      });
      if (!tournament) throw new NoTournamentError();
      return change(draft.tx, tournament);
    });
  }
}

/**
 * The tournament's match `matchId`, with its tournament round, and its
 * players' Discord user ids and whether each has dropped, in its player
 * order.
 * Throws NoMatchError if it has no such match; a bye is no match.
 */
export async function findMatch(
  tx: Transaction,
  tournamentId: string,
  matchId: string,
) {
  const match = await tx.match.findFirst({
    where: { id: matchId, tournamentId, secondEntryId: { not: null } },
    select: {
      round: true,
      outcome: true,
      reportedById: true,
      firstEntry: { select: ENTRY_OF_MATCH },
      secondEntry: { select: ENTRY_OF_MATCH },
    },
  });
  if (!match) throw new NoMatchError();
  return {
    round: match.round,
    outcome: match.outcome,
    reportedById: match.reportedById,
    players: [match.firstEntry.player.userId, match.secondEntry?.player.userId],
    dropped: [match.firstEntry.dropped, !!match.secondEntry?.dropped],
  };
}

/**
 * The tournament entry of the draft's player `userId`, to take them out of
 * the tournament or put them back in. Throws TournamentRefusedError if they
 * haven't joined it, or are a bot, which stays in.
 */
export async function entryOf(
  tx: Transaction,
  tournament: LockedTournament,
  draftId: string,
  userId: string,
): Promise<{ id: string; dropped: boolean }> {
  const entry = await tx.tournamentEntry.findFirst({
    where: { tournamentId: tournament.id, player: { draftId, userId } },
    select: {
      id: true,
      dropped: true,
      player: { select: { user: { select: { isBot: true } } } },
    },
  });
  if (!entry) {
    throw new TournamentRefusedError({
      error: 'not-joined',
      message: 'That player hasn’t joined this tournament.',
    });
  }
  if (!droppable(entry)) throw new TournamentRefusedError(BOT_ENTRY);
  return entry;
}
