import { Injectable } from '@nestjs/common';
import type { DecklistView } from 'contract';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import { readPlanBoards } from '../drafts/plans.service.js';
import { readPreferredPrintings } from '../drafts/preferred-printings.js';
import { decodeDecklist, encodeDecklist } from './decklist-json.js';
import {
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';
import { showsDecklists } from './tournament-view.js';

/**
 * Snapshots each entry's deck, bots' included, as it is when the
 * tournament `tournamentId` starts, so its decklist shows the deck as it
 * was locked, even once the tournament completes and the deck unlocks.
 * Every deck is kept, whatever the tournament's public decklists setting
 * (ADR 0017). Runs under the draft's lock, in Start's transaction.
 */
export async function snapshotDecklists(
  tx: Transaction,
  tournamentId: string,
): Promise<void> {
  const tournament = await tx.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { entries: { select: { id: true, playerId: true } } },
  });
  for (const entry of tournament.entries) {
    const boards = await readPlanBoards(tx, entry.playerId);
    await tx.tournamentEntry.update({
      where: { id: entry.id },
      data: { decklist: encodeDecklist(boards) },
    });
  }
}

/**
 * A draft's decklists: its tournament's joined players' decks, as they
 * were locked at Start, shown under public decklists once it has started,
 * and for every tournament once it is complete. Nobody else's deck, and
 * nobody's otherwise, organizers and app admins included (ADR 0002, as
 * ADRs 0005 and 0017 amend it).
 */
@Injectable()
export class DecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The draft's decklists, one per joined player, in join order. Throws
   * NoTournamentError if it has no tournament, and TournamentRefusedError
   * during registration (`in-registration`) or while playing without
   * public decklists (`decklists-private`). Throws MalformedDecklistError, a 500, for
   * an entry whose snapshot is missing or malformed, rather than serve a
   * decklist without its boards.
   */
  async read(draftId: string): Promise<DecklistView[]> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { draftId },
      select: {
        publicDecklists: true,
        state: true,
        entries: {
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          select: { decklist: true, player: { select: { userId: true } } },
        },
      },
    });
    if (!tournament) throw new NoTournamentError();
    if (!showsDecklists(tournament)) {
      throw new TournamentRefusedError(
        tournament.state === 'Registration'
          ? {
              error: 'in-registration',
              message: tournament.publicDecklists
                ? 'Decklists are shown once the tournament starts.'
                : 'Decklists are shown once the tournament is complete.',
            }
          : {
              error: 'decklists-private',
              message:
                'This tournament’s decks are private until it is complete.',
            },
      );
    }
    // Each player's preferred printings as they are now: not part of the snapshot.
    const printings = await readPreferredPrintings(
      this.prisma,
      tournament.entries.map((entry) => entry.player.userId),
    );
    return tournament.entries.map((entry) => ({
      playerId: entry.player.userId,
      ...decodeDecklist(entry.decklist),
      preferredPrintings: printings.get(entry.player.userId)!,
    }));
  }
}
