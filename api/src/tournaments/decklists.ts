import { Injectable } from '@nestjs/common';
import type { DecklistView } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import { readPlanBoards, type PlanBoards } from '../drafts/plans.service.js';
import {
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';
import { showsDecklists } from './tournament-view.js';

/**
 * Under public decklists, keeps each entry's deck as it is when the
 * tournament `tournamentId` starts, so its decklist shows the deck as it
 * was locked, even once the tournament completes and the deck unlocks.
 * Without public decklists it keeps nothing: those decks are never shown
 * (ADR 0005). Runs under the draft's lock, in Start's transaction.
 */
export async function keepDecklists(
  tx: Transaction,
  tournamentId: string,
): Promise<void> {
  const tournament = await tx.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: {
      publicDecklists: true,
      entries: { select: { id: true, playerId: true } },
    },
  });
  if (!tournament.publicDecklists) return;
  for (const entry of tournament.entries) {
    const decklist = await readPlanBoards(tx, entry.playerId);
    await tx.tournamentEntry.update({
      where: { id: entry.id },
      data: { decklist: decklist as unknown as Prisma.InputJsonObject },
    });
  }
}

/**
 * A draft's decklists: its tournament's joined players' decks, as they
 * were locked at Start, shown only under public decklists once it has
 * started. Nobody else's deck, and nobody's otherwise, organizers and app
 * admins included (ADR 0002, as ADR 0005 amends it).
 */
@Injectable()
export class DecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The draft's decklists, one per joined player, in join order. Throws
   * NoTournamentError if it has no tournament, and TournamentRefusedError
   * without public decklists (`decklists-private`) or during registration
   * (`tournament-not-started`).
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
    if (!tournament.publicDecklists) {
      throw new TournamentRefusedError({
        error: 'decklists-private',
        message: 'This tournament’s decks are private.',
      });
    }
    if (!showsDecklists(tournament)) {
      throw new TournamentRefusedError({
        error: 'tournament-not-started',
        message: 'Decklists are shown once the tournament starts.',
      });
    }
    return tournament.entries.map((entry) => ({
      playerId: entry.player.userId,
      ...(entry.decklist as unknown as PlanBoards),
    }));
  }
}
