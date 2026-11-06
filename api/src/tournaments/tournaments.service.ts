import { Injectable } from '@nestjs/common';
import {
  MIN_MAINBOARD_CARDS,
  type TournamentFormat,
  type TournamentView,
} from 'contract';
import type { TournamentState } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftGoneError, NotAPlayerError } from '../drafts/draft-errors.js';
import { DraftLock } from '../drafts/draft-lock.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';

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
      select: {
        format: true,
        state: true,
        entries: {
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          select: { player: { select: { userId: true } } },
        },
      },
    });
    if (!tournament) throw new NoTournamentError();
    return {
      format: tournament.format,
      state: tournament.state,
      entries: tournament.entries.map(({ player }) => ({
        playerId: player.userId,
      })),
    };
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
   * Cancels the draft's tournament, deleting it and its entries, which
   * unlocks every deck. Throws TournamentRefusedError past registration.
   */
  async cancel(draftId: string): Promise<void> {
    await this.inRegistration(draftId, async (tx, tournament) => {
      await tx.tournament.delete({ where: { id: tournament.id } });
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is in
   * registration. Throws NoTournamentError if it has none, and
   * TournamentRefusedError if it is past registration.
   */
  private async inRegistration(
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
      if (tournament.state !== 'Registration') {
        throw new TournamentRefusedError({
          error: 'not-in-registration',
          message: 'This tournament has started.',
        });
      }
      await change(draft.tx, tournament);
    });
  }
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
