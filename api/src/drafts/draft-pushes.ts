import { Injectable, Logger } from '@nestjs/common';
import type { DraftView } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftReadsService } from './draft-reads.service.js';
import type { Transaction } from './draft-shapes.js';
import { toDraftView } from './draft-view.js';
import { DraftsGateway } from './drafts.gateway.js';

/**
 * Bumps the version of every draft `where` finds, in the write's
 * transaction, so viewers take the copies pushed after it as newer.
 */
export type BumpDrafts = (where: Prisma.DraftWhereInput) => Promise<void>;

/** What is logged when a change to draft `draftId` couldn't be pushed. */
export const pushFailedMessage = (draftId: string) =>
  `Couldn’t publish a change to draft ${draftId}`;

/**
 * Pushes drafts to everyone viewing them. Also runs the writes outside the
 * draft lock (`DraftLock`) that change what drafts show, such as a change to
 * their webhook in the webhook registry or to a player's name at sign-in,
 * bumping and pushing the drafts they change.
 *
 * Lock order: such a write locks the row it changes first, the webhook's or
 * the user's, then the drafts' rows, as it bumps them. A change under the
 * draft lock holds its draft's row but takes only a key share lock on its
 * webhook or user, through their foreign keys, which the write's NO KEY
 * UPDATE doesn't wait on, so neither waits on the other in turn. A webhook's
 * removal locks its row FOR UPDATE instead, to wait for them: see
 * `WebhooksService.remove`.
 */
@Injectable()
export class DraftPushes {
  private readonly logger = new Logger(DraftPushes.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reads: DraftReadsService,
    private readonly gateway: DraftsGateway,
  ) {}

  /**
   * Runs `write` in a transaction, giving it `bump` for the drafts it
   * changes, and once that commits, pushes each draft bumped, announcing
   * nothing. Returns what `write` returns. If the transaction fails, no
   * bump stands and nothing is pushed. A push that fails is logged and the
   * rest still go: the write committed, so it hasn't failed.
   */
  async changing<T>(
    write: (tx: Transaction, bump: BumpDrafts) => Promise<T>,
  ): Promise<T> {
    const bumped: string[] = [];
    const result = await this.prisma.$transaction((tx: Transaction) =>
      write(tx, async (where) => {
        bumped.push(...(await this.bump(tx, where)));
      }),
    );
    await this.pushAll(bumped);
    return result;
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
   * Bumps the version of every draft `where` finds, in `tx`, in one atomic
   * increment and not through the draft lock. Returns their ids.
   */
  private async bump(
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

  /** Pushes each draft, logging each push that fails. Never rejects. */
  private async pushAll(draftIds: string[]): Promise<void> {
    for (const draftId of draftIds) {
      try {
        await this.push(draftId);
      } catch (err) {
        this.logger.error(pushFailedMessage(draftId), err);
      }
    }
  }
}
