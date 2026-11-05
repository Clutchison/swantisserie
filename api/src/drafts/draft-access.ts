import { Injectable } from '@nestjs/common';
import type { DraftPowersView } from 'contract';
import type { SessionUser } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftHiddenError, NoDraftPowerError } from './draft-errors.js';

/** Who is asking about a draft: just what draft access reads of them. */
export type DraftViewer = Pick<SessionUser, 'id' | 'isAppAdmin'>;

/** What draft access reads of a draft: no players, webhook or counts. */
const ACCESS_FIELDS = { id: true, organizerId: true } as const;

type DraftForAccess = { id: string; organizerId: string | null };

/**
 * Answers every question about who may see or change a draft. Every drafts,
 * queues and plans route and the socket gateway ask it, so a rule changes
 * here only. Each check throws DraftHiddenError for a draft the viewer may
 * not see, before NoDraftPowerError for a power they lack.
 */
@Injectable()
export class DraftAccess {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws unless the viewer may see the draft: for now, unless it exists. */
  async visible(viewer: DraftViewer, draftId: string): Promise<void> {
    await this.find(viewer, draftId);
  }

  /** Throws unless the viewer may act as the draft's organizer. */
  async asOrganizer(viewer: DraftViewer, draftId: string): Promise<void> {
    const powers = powersOf(viewer, await this.find(viewer, draftId));
    if (!powers.organize) throw new NoDraftPowerError();
  }

  /** Throws unless the viewer may add bots to the draft and remove them. */
  async canAddBots(viewer: DraftViewer, draftId: string): Promise<void> {
    const powers = powersOf(viewer, await this.find(viewer, draftId));
    if (!powers.addBots) throw new NoDraftPowerError();
  }

  /** The viewer's draft powers, from the same rule as the checks. */
  async powers(viewer: DraftViewer, draftId: string): Promise<DraftPowersView> {
    return powersOf(viewer, await this.find(viewer, draftId));
  }

  /**
   * The draft, if the viewer may see it. `viewer` goes unread until a
   * draft's guild decides who sees it (#208).
   */
  private async find(
    _viewer: DraftViewer,
    draftId: string,
  ): Promise<DraftForAccess> {
    const draft = await this.prisma.draft.findUnique({
      where: { id: draftId },
      select: ACCESS_FIELDS,
    });
    if (!draft) throw new DraftHiddenError();
    return draft;
  }
}

/** The one rule for what a viewer may do to a draft they can see. */
function powersOf(viewer: DraftViewer, draft: DraftForAccess): DraftPowersView {
  const organize = viewer.isAppAdmin || draft.organizerId === viewer.id;
  return {
    organize,
    addBots: viewer.isAppAdmin,
    // #213 narrows this to app admins and guild admins.
    switchAnnouncements: organize,
  };
}
