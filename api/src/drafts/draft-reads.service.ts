import { Injectable } from '@nestjs/common';
import type { TournamentBadgeView } from 'contract';
import type { PoolCard, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toTournamentBadge,
  tournamentBadgeRead,
} from '../tournaments/tournament-badge.js';
import { SEAT_ORDER } from './draft-shapes.js';

export const WITH_ORGANIZER = {
  include: {
    organizer: { select: { id: true, name: true } },
    // Never the URL: it is a secret only app admins may see.
    webhook: { select: { id: true, name: true, goneAt: true } },
    players: {
      orderBy: SEAT_ORDER,
      select: {
        user: { select: { id: true, name: true, avatar: true, isBot: true } },
      },
    },
    tournament: { select: { state: true } },
    _count: { select: { pool: true, picks: true } },
  },
} satisfies Prisma.DraftDefaultArgs;

export type DraftWithOrganizer = Prisma.DraftGetPayload<typeof WITH_ORGANIZER>;

/** Drafts and their pools as they are read, whatever state they are in. */
@Injectable()
export class DraftReadsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(id: string): Promise<DraftWithOrganizer | null> {
    return this.prisma.draft.findUnique({ where: { id }, ...WITH_ORGANIZER });
  }

  /** Every draft, newest first. */
  async list(): Promise<DraftWithOrganizer[]> {
    return this.prisma.draft.findMany({
      orderBy: { createdAt: 'desc' },
      ...WITH_ORGANIZER,
    });
  }

  /**
   * The tournament badge of every draft with a tournament, as the user
   * `viewerId` sees it, by draft id.
   */
  async tournamentBadges(
    viewerId: string,
  ): Promise<Map<string, TournamentBadgeView>> {
    const rows = await this.prisma.tournament.findMany({
      select: tournamentBadgeRead(viewerId),
    });
    return new Map(rows.map((row) => [row.draftId, toTournamentBadge(row)]));
  }

  /** The draft's pool so far, by name. */
  async pool(draftId: string): Promise<PoolCard[]> {
    return this.prisma.poolCard.findMany({
      where: { draftId },
      orderBy: { name: 'asc' },
    });
  }
}
