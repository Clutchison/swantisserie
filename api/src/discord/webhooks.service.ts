import { Injectable } from '@nestjs/common';
import { DraftPushes } from '../drafts/draft-pushes.js';
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
 * them, announcing nothing, through DraftPushes, whose lock order each write
 * here follows: the webhook's row, then the drafts'.
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
      this.pushes.changing(async (tx, bump) => {
        const { count } = await tx.webhook.updateMany({
          where: { id, name: { not: name } },
          data: { name },
        });
        if (count) await bump({ webhookId: id });
        return tx.webhook.findUnique({ where: { id } });
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
    return this.pushes.changing(async (tx, bump) => {
      // Held until commit, so gone can't be marked between this read and the
      // update.
      const [row] = await tx.$queryRaw<Pick<Webhook, 'goneAt'>[]>`
        SELECT "goneAt" FROM "Webhook" WHERE "id" = ${id} FOR NO KEY UPDATE`;
      if (!row) return null;
      const result = await tx.webhook.update({
        where: { id },
        data: { url, goneAt: null },
      });
      if (row.goneAt) await bump({ webhookId: id });
      return result;
    });
  }

  /**
   * Removes the webhook; drafts that posted to it post nowhere. Returns
   * whether there was such a webhook.
   */
  async remove(id: string): Promise<boolean> {
    return this.pushes.changing(async (tx, bump) => {
      // FOR UPDATE, not NO KEY UPDATE: it waits for any change under the
      // draft lock switching a draft to the webhook, which holds a key share
      // lock on it, to commit, so the bump below sees that draft too; one
      // switching later fails its foreign key check once this commits.
      // Nothing is locked meanwhile, so the wait can't deadlock.
      const [row] = await tx.$queryRaw<Pick<Webhook, 'id'>[]>`
        SELECT "id" FROM "Webhook" WHERE "id" = ${id} FOR UPDATE`;
      if (!row) return false;
      // Before the delete, while the drafts still name it. The delete then
      // clears each draft's webhook (onDelete: SetNull).
      await bump({ webhookId: id });
      await tx.webhook.delete({ where: { id } });
      return true;
    });
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
