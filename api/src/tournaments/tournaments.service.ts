import { Injectable } from '@nestjs/common';
import {
  MIN_MAINBOARD_CARDS,
  type TournamentFormat,
  type TournamentRefusal,
  type TournamentView,
} from 'contract';
import { reportProblem, roundRobinSchedule } from 'engine';
import type { TournamentState } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftGoneError, NotAPlayerError } from '../drafts/draft-errors.js';
import { DraftLock } from '../drafts/draft-lock.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  NoMatchError,
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/** What a change reads of the tournament it changes. */
interface LockedTournament {
  id: string;
  state: TournamentState;
}

/**
 * A complete draft's tournament: its setup, registration and cancelling.
 * Every change runs under the draft's lock, which bumps the draft's version,
 * so the controller's publish tells open pages to re-read it. Joining under
 * that lock also waits for any plan write in flight, which share-locks the
 * draft, so a deck can't change as it is checked and locked.
 */
@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: DraftLock,
  ) {}

  /** The draft's tournament. Throws NoTournamentError if it has none. */
  async read(draftId: string): Promise<TournamentView> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { draftId },
      select: TOURNAMENT_VIEW,
    });
    if (!tournament) throw new NoTournamentError();
    return toTournamentView(tournament);
  }

  /**
   * Sets up the draft's tournament in `format`, in registration. Throws
   * TournamentRefusedError unless the draft is complete and has none yet.
   */
  async setUp(draftId: string, format: TournamentFormat): Promise<void> {
    await this.lock.whileIn(
      draftId,
      ['Complete'],
      () =>
        new TournamentRefusedError({
          error: 'draft-not-complete',
          message: 'Only a complete draft can have a tournament.',
        }),
      async ({ tx }) => {
        const existing = await tx.tournament.findUnique({
          where: { draftId },
          select: { id: true },
        });
        if (existing) {
          throw new TournamentRefusedError({
            error: 'tournament-exists',
            message: 'This draft already has a tournament.',
          });
        }
        await tx.tournament.create({ data: { draftId, format } });
      },
    );
  }

  /**
   * Joins the user to the draft's tournament, which locks their deck.
   * Throws NotAPlayerError if they aren't one of the draft's players, and
   * TournamentRefusedError if they are a bot, have joined already, or their
   * mainboard holds fewer than MIN_MAINBOARD_CARDS, or the tournament is
   * past registration.
   */
  async join(draftId: string, userId: string): Promise<void> {
    await this.inRegistration(draftId, async (tx, tournament) => {
      const player = await tx.player.findUnique({
        where: { draftId_userId: { draftId, userId } },
        select: {
          id: true,
          user: { select: { isBot: true } },
          tournamentEntry: { select: { id: true } },
        },
      });
      if (!player) throw new NotAPlayerError('tournaments');
      if (player.user.isBot) {
        throw new TournamentRefusedError({
          error: 'bots-cannot-join',
          message: 'Bots never play in tournaments.',
        });
      }
      if (player.tournamentEntry) {
        throw new TournamentRefusedError({
          error: 'already-joined',
          message: 'You have already joined this tournament.',
        });
      }
      const cards = await mainboardSize(tx, player.id);
      if (cards < MIN_MAINBOARD_CARDS) {
        throw new TournamentRefusedError({
          error: 'deck-too-small',
          message: `Your mainboard holds ${cards} ${cards === 1 ? 'card' : 'cards'}. A tournament deck needs at least ${MIN_MAINBOARD_CARDS}.`,
        });
      }
      await tx.tournamentEntry.create({
        data: { tournamentId: tournament.id, playerId: player.id },
      });
    });
  }

  /**
   * Takes the draft's player `userId` out of its tournament, unlocking
   * their deck: they leave, or an organizer removes them. Throws
   * TournamentRefusedError if they haven't joined, or the tournament is past
   * registration.
   */
  async removeEntry(draftId: string, userId: string): Promise<void> {
    await this.inRegistration(draftId, async (tx, tournament) => {
      const { count } = await tx.tournamentEntry.deleteMany({
        where: { tournamentId: tournament.id, player: { draftId, userId } },
      });
      if (count === 0) {
        throw new TournamentRefusedError({
          error: 'not-joined',
          message: 'That player hasn’t joined this tournament.',
        });
      }
    });
  }

  /**
   * Cancels the draft's tournament during registration or play, deleting it
   * with its entries and matches, so nothing from it counts and every deck
   * unlocks. Throws TournamentRefusedError once it is complete.
   */
  async cancel(draftId: string): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      if (tournament.state === 'Complete') {
        throw new TournamentRefusedError({
          error: 'tournament-complete',
          message:
            'A complete tournament can’t be cancelled. An organizer can still correct its results.',
        });
      }
      await tx.tournament.delete({ where: { id: tournament.id } });
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
    await this.withTournament(draftId, async (tx, tournament) => {
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
   * players or correcting it, while the tournament is playing or once it is
   * complete. The opponent hasn't agreed to it, so it is unconfirmed. Throws
   * NoMatchError if the tournament has no such match, and
   * TournamentRefusedError if the game score isn't 2–0 or 2–1 for either
   * side.
   */
  async setResult(
    draftId: string,
    matchId: string,
    userId: string,
    games: [number, number],
  ): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      await findMatch(tx, tournament.id, matchId);
      const problem = reportProblem(games);
      if (problem) throw new TournamentRefusedError(problem);
      await tx.match.update({
        where: { id: matchId },
        data: {
          outcome: 'GameScore',
          firstGames: games[0],
          secondGames: games[1],
          drawnGames: 0,
          forfeitedBy: null,
          reportedById: userId,
          confirmed: false,
        },
      });
    });
  }

  /**
   * Clears the match `matchId`'s result, as an organizer does. While the
   * tournament is playing it is unreported again, unless one of its players
   * has dropped: then it is their forfeit again, as taking back a drop
   * leaves a match against a player still dropped. Once the tournament is
   * complete it is a granted draw, as completing it would have made it.
   * Throws NoMatchError if the tournament has no such match.
   */
  async clearResult(draftId: string, matchId: string): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      const { dropped } = await findMatch(tx, tournament.id, matchId);
      const forfeitedBy =
        tournament.state !== 'Playing'
          ? null
          : dropped[0]
            ? ('First' as const)
            : dropped[1]
              ? ('Second' as const)
              : null;
      await tx.match.update({
        where: { id: matchId },
        data: {
          outcome:
            tournament.state === 'Complete'
              ? 'GrantedDraw'
              : forfeitedBy
                ? 'Forfeit'
                : 'Unreported',
          firstGames: 0,
          secondGames: 0,
          drawnGames: 0,
          forfeitedBy,
          reportedById: null,
          confirmed: false,
        },
      });
    });
  }

  /**
   * Starts the draft's tournament, closing joining: it makes every match of
   * the round robin schedule of its entries, in join order, byes included,
   * all open at once. Throws TournamentRefusedError if fewer than 2 players
   * have joined, or it is past registration.
   */
  async start(draftId: string): Promise<void> {
    await this.inRegistration(draftId, async (tx, tournament) => {
      const entries = await tx.tournamentEntry.findMany({
        where: { tournamentId: tournament.id },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      if (entries.length < 2) {
        throw new TournamentRefusedError({
          error: 'too-few-entries',
          message: 'A tournament needs at least 2 players to start.',
        });
      }
      const schedule = roundRobinSchedule(entries.map((entry) => entry.id));
      await tx.match.createMany({
        data: schedule.flatMap(({ matches, bye }, i) => [
          ...matches.map(([firstEntryId, secondEntryId]) => ({
            tournamentId: tournament.id,
            round: i + 1,
            firstEntryId,
            secondEntryId,
          })),
          ...(bye
            ? [{ tournamentId: tournament.id, round: i + 1, firstEntryId: bye }]
            : []),
        ]),
      });
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { state: 'Playing', startedAt: new Date() },
      });
    });
  }

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
    games: [number, number],
  ): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      const match = await tx.match.findFirst({
        where: {
          id: matchId,
          tournamentId: tournament.id,
          secondEntryId: { not: null },
        },
        select: {
          outcome: true,
          firstEntry: { select: { player: { select: { userId: true } } } },
          secondEntry: { select: { player: { select: { userId: true } } } },
        },
      });
      if (!match) throw new NoMatchError();
      const players = [match.firstEntry, match.secondEntry].map(
        (entry) => entry?.player.userId,
      );
      if (!players.includes(userId)) {
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
        data: {
          outcome: 'GameScore',
          firstGames: games[0],
          secondGames: games[1],
          drawnGames: 0,
          reportedById: userId,
        },
      });
    });
  }

  /**
   * Completes the draft's round robin tournament: every unreported match
   * becomes a granted draw, and every deck unlocks. Throws
   * TournamentRefusedError if it isn't playing.
   */
  async complete(draftId: string): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
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
    });
  }

  /**
   * Drops the draft's player `userId` from its tournament: every unplayed
   * match of theirs becomes a forfeit by them, and their played matches
   * stand. Their deck stays locked. Throws TournamentRefusedError if they
   * haven't joined or have dropped already, or the tournament isn't playing.
   */
  async drop(draftId: string, userId: string): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      const entry = await entryOf(tx, tournament, draftId, userId);
      if (entry.dropped) {
        throw new TournamentRefusedError({
          error: 'already-dropped',
          message: 'That player has already dropped.',
        });
      }
      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: { dropped: true },
      });
      await forfeitUnplayed(tx, entry.id);
    });
  }

  /**
   * Takes back the drop of the draft's player `userId`: their forfeits
   * become unreported matches again, except against an opponent who has
   * dropped too, whose forfeit they become. Throws TournamentRefusedError if
   * they haven't joined or haven't dropped, or the tournament isn't playing.
   */
  async undoDrop(draftId: string, userId: string): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      const entry = await entryOf(tx, tournament, draftId, userId);
      if (!entry.dropped) {
        throw new TournamentRefusedError({
          error: 'not-dropped',
          message: 'That player hasn’t dropped.',
        });
      }
      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: { dropped: false },
      });
      await tx.match.updateMany({
        where: {
          outcome: 'Forfeit',
          OR: [
            { firstEntryId: entry.id, forfeitedBy: 'First' },
            { secondEntryId: entry.id, forfeitedBy: 'Second' },
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
        where: { tournamentId: tournament.id, dropped: true },
        select: { id: true },
      });
      for (const other of stillDropped) await forfeitUnplayed(tx, other.id);
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is in
   * registration. Throws NoTournamentError if it has none, and
   * TournamentRefusedError if it is past registration.
   */
  private inRegistration(
    draftId: string,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
  ): Promise<void> {
    return this.whileIn(draftId, 'Registration', change, {
      error: 'not-in-registration',
      message: 'This tournament has started.',
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is
   * playing. Throws NoTournamentError if it has none, and
   * TournamentRefusedError if it isn't playing.
   */
  private inPlay(
    draftId: string,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
  ): Promise<void> {
    return this.whileIn(draftId, 'Playing', change, {
      error: 'not-playing',
      message: 'This tournament isn’t being played.',
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is in
   * `state`. Throws NoTournamentError if it has none, and
   * TournamentRefusedError with `refusal` if it is in another state.
   */
  private whileIn(
    draftId: string,
    state: TournamentState,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
    refusal: TournamentRefusal,
  ): Promise<void> {
    return this.withTournament(draftId, async (tx, tournament) => {
      if (tournament.state !== state) {
        throw new TournamentRefusedError(refusal);
      }
      await change(tx, tournament);
    });
  }

  /**
   * Runs `change` with the draft's row locked, whatever state its
   * tournament is in. Throws NoTournamentError if it has none.
   */
  private async withTournament(
    draftId: string,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
  ): Promise<void> {
    await this.lock.run(draftId, async (draft) => {
      if (!draft) throw new DraftGoneError();
      const tournament = await draft.tx.tournament.findUnique({
        where: { draftId },
        select: { id: true, state: true },
      });
      if (!tournament) throw new NoTournamentError();
      await change(draft.tx, tournament);
    });
  }
}

/** What findMatch reads of each of a match's entries. */
const ENTRY_OF_MATCH = {
  dropped: true,
  player: { select: { userId: true } },
} as const;

/**
 * The tournament's match `matchId`, with its players' Discord user ids and
 * whether each has dropped, in its player order.
 * Throws NoMatchError if it has no such match; a bye is no match.
 */
async function findMatch(
  tx: Transaction,
  tournamentId: string,
  matchId: string,
) {
  const match = await tx.match.findFirst({
    where: { id: matchId, tournamentId, secondEntryId: { not: null } },
    select: {
      outcome: true,
      reportedById: true,
      firstEntry: { select: ENTRY_OF_MATCH },
      secondEntry: { select: ENTRY_OF_MATCH },
    },
  });
  if (!match) throw new NoMatchError();
  return {
    outcome: match.outcome,
    reportedById: match.reportedById,
    players: [match.firstEntry.player.userId, match.secondEntry?.player.userId],
    dropped: [match.firstEntry.dropped, !!match.secondEntry?.dropped],
  };
}

/** How many cards the player's mainboard holds: its cards plus its basic lands. */
async function mainboardSize(
  tx: Transaction,
  playerId: string,
): Promise<number> {
  const cards = await tx.plannedCard.count({
    where: { playerId, board: 'Mainboard' },
  });
  const basics = await tx.plannedBasic.aggregate({
    where: { playerId },
    _sum: { count: true },
  });
  return cards + (basics._sum.count ?? 0);
}

/**
 * The tournament entry of the draft's player `userId`. Throws
 * TournamentRefusedError if they haven't joined it.
 */
async function entryOf(
  tx: Transaction,
  tournament: LockedTournament,
  draftId: string,
  userId: string,
): Promise<{ id: string; dropped: boolean }> {
  const entry = await tx.tournamentEntry.findFirst({
    where: { tournamentId: tournament.id, player: { draftId, userId } },
    select: { id: true, dropped: true },
  });
  if (!entry) {
    throw new TournamentRefusedError({
      error: 'not-joined',
      message: 'That player hasn’t joined this tournament.',
    });
  }
  return entry;
}

/** Turns every unplayed match of the entry `entryId`, byes aside, into a forfeit by it. */
async function forfeitUnplayed(tx: Transaction, entryId: string) {
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
