import { Injectable, Logger } from '@nestjs/common';
import type { DraftView } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { DraftReadsService } from './draft-reads.service.js';
import type { Transaction } from './draft-shapes.js';
import { toDraftView } from './draft-view.js';
import { DraftsGateway } from './drafts.gateway.js';

/**
 * Pushes drafts to everyone viewing them. Also bumps the version of the
 * drafts a write outside the draft lock changes, such as a change to their
 * webhook in the webhook registry, so viewers take the pushed copy as newer.
 */
@Injectable()
export class DraftPushes {
  private readonly logger = new Logger(DraftPushes.name);

  constructor(
    private readonly reads: DraftReadsService,
    private readonly gateway: DraftsGateway,
  ) {}

  /**
   * Bumps the version of every draft `where` finds, in `tx`, in one atomic
   * increment and not through the draft lock: for a write in `tx` that
   * changes what those drafts show. Returns their ids, for `pushAll` once
   * `tx` commits.
   */
  async bump(
    tx: Transaction,
    where: Prisma.DraftWhereInput,
  ): Promise<string[]> {
    const bumped = await tx.draft.updateManyAndReturn({
      where,
      data: { version: { increment: 1 } },
      select: { id: true },
    });
    return bumped.map(({ id }) => id);
  }

  /**
   * Sends everyone viewing the draft, each of its players but the bots, and
   * each of `alsoTellUserIds`, how it now is. Returns the draft as sent, or
   * null if there is no such draft.
   */
  async push(
    draftId: string,
    alsoTellUserIds: string[] = [],
  ): Promise<DraftView | null> {
    const found = await this.reads.find(draftId);
    if (!found) return null;
    const draft = toDraftView(found);
    this.gateway.changed(draft, alsoTellUserIds);
    return draft;
  }

  /**
   * Pushes each of the drafts `bump` returned, once their write has
   * committed, announcing nothing. A push that fails is logged and the rest
   * still go: the write committed, so it hasn't failed.
   */
  async pushAll(draftIds: string[]): Promise<void> {
    for (const draftId of draftIds) {
      try {
        await this.push(draftId);
      } catch (err) {
        this.logger.error(`Couldn’t publish a change to draft ${draftId}`, err);
      }
    }
  }
}
