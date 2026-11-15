import { Injectable } from '@nestjs/common';
import type { PoolCard, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftAccess, type DraftViewer } from './draft-access.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DraftAccess,
  ) {}

  async find(id: string): Promise<DraftWithOrganizer | null> {
    return this.prisma.draft.findUnique({ where: { id }, ...WITH_ORGANIZER });
  }

  /** Every draft the viewer sees, newest first. */
  async list(viewer: DraftViewer): Promise<DraftWithOrganizer[]> {
    return this.prisma.draft.findMany({
      where: this.access.seenBy(viewer),
      orderBy: { createdAt: 'desc' },
      ...WITH_ORGANIZER,
    });
  }

  /** The draft's pool so far, by name. */
  async pool(draftId: string): Promise<PoolCard[]> {
    return this.prisma.poolCard.findMany({
      where: { draftId },
      orderBy: { name: 'asc' },
    });
  }
}
