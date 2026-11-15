import { Injectable } from '@nestjs/common';
import { DraftPushes } from '../drafts/draft-pushes.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import { Prisma, type Webhook } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What an app admin enters to register a webhook. */
export interface NewWebhook {
  name: string;
  url: string;
}

/** Thrown when a webhook would share its name with another. */
export class WebhookNameTakenError extends Error {
  constructor(name: string) {
    super(`Another webhook is called ${name}.`);
  }
}

/**
 * The named Discord webhooks app admins register, for drafts to post to. A
 * change to what the drafts using a webhook show bumps and pushes each of
 * them, announcing nothing.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushes: DraftPushes,
  ) {}

  /** Every webhook, by name. */
  async list(): Promise<Webhook[]> {
    return this.prisma.webhook.findMany({ orderBy: { name: 'asc' } });
  }

  /** Throws WebhookNameTakenError if another webhook has its name. */
  async add(webhook: NewWebhook): Promise<Webhook> {
    return this.uniquelyNamed(webhook.name, () =>
      this.prisma.webhook.create({ data: webhook }),
    );
  }

  /**
   * Gives the webhook a new name, or returns null if there is no such
   * webhook. Throws WebhookNameTakenError if another webhook has the name.
   * A new name changes every draft using the webhook, as they show its
   * name; the name it already has changes none.
   */
  async rename(id: string, name: string): Promise<Webhook | null> {
    return this.uniquelyNamed(name, () =>
      this.changingDrafts(async (tx) => {
        const { count } = await tx.webhook.updateMany({
          where: { id, name: { not: name } },
          data: { name },
        });
        const bumped = count
          ? await this.pushes.bump(tx, { webhookId: id })
          : [];
        const result = await tx.webhook.findUnique({ where: { id } });
        return { result, bumped };
      }),
    );
  }

  /**
   * Gives the webhook a new URL, keeping its name and the drafts using it,
   * and clears gone. Returns null if there is no such webhook. Clearing gone
   * changes every draft using the webhook; a new URL on a webhook that isn't
   * gone changes none, as no draft shows its URL.
   */
  async replaceUrl(id: string, url: string): Promise<Webhook | null> {
    return this.changingDrafts(async (tx) => {
      // Held until commit, so gone can't be marked between this read and the
      // update. NO KEY UPDATE, as the update itself takes, doesn't wait on a
      // locked change's key lock on the webhook, held with its draft's row.
      const [row] = await tx.$queryRaw<Pick<Webhook, 'goneAt'>[]>`
        SELECT "goneAt" FROM "Webhook" WHERE "id" = ${id} FOR NO KEY UPDATE`;
      if (!row) return { result: null, bumped: [] };
      const result = await tx.webhook.update({
        where: { id },
        data: { url, goneAt: null },
      });
      const bumped = row.goneAt
        ? await this.pushes.bump(tx, { webhookId: id })
        : [];
      return { result, bumped };
    });
  }

  /**
   * Removes the webhook; drafts that posted to it post nowhere. Returns
   * whether there was such a webhook.
   */
  async remove(id: string): Promise<boolean> {
    return this.changingDrafts(async (tx) => {
      // The webhook's row first, as every registry write locks it before the
      // drafts using it. FOR UPDATE waits for any locked change switching a
      // draft to the webhook, which holds a key lock on it, to commit, so the
      // bump below sees that draft too; one switching later fails its
      // foreign key check once this commits. Nothing is locked meanwhile, so
      // the wait can't deadlock.
      const [row] = await tx.$queryRaw<Pick<Webhook, 'id'>[]>`
        SELECT "id" FROM "Webhook" WHERE "id" = ${id} FOR UPDATE`;
      if (!row) return { result: false, bumped: [] };
      // Before the delete, while the drafts still name it. The delete then
      // clears each draft's webhook (onDelete: SetNull).
      const bumped = await this.pushes.bump(tx, { webhookId: id });
      await tx.webhook.delete({ where: { id } });
      return { result: true, bumped };
    });
  }

  /**
   * Runs `write` in a transaction, then pushes the drafts it says it bumped,
   * once committed. Returns its `result`.
   */
  private async changingDrafts<T>(
    write: (tx: Transaction) => Promise<{ result: T; bumped: string[] }>,
  ): Promise<T> {
    const { result, bumped } = await this.prisma.$transaction(write);
    await this.pushes.pushAll(bumped);
    return result;
  }

  private async uniquelyNamed<T>(
    name: string,
    save: () => Promise<T>,
  ): Promise<T> {
    try {
      return await save();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new WebhookNameTakenError(name);
      }
      throw err;
    }
  }
}
