import { Injectable } from '@nestjs/common';
import { Prisma, type Webhook } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A webhook as organizers choose it: by name, its URL kept secret. */
export interface WebhookView {
  id: string;
  name: string;
}

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

/** The named Discord webhooks app admins register, for drafts to post to. */
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

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
   */
  async rename(id: string, name: string): Promise<Webhook | null> {
    return this.uniquelyNamed(name, async () => {
      const { count } = await this.prisma.webhook.updateMany({
        where: { id },
        data: { name },
      });
      return count ? this.prisma.webhook.findUnique({ where: { id } }) : null;
    });
  }

  /**
   * Removes the webhook; drafts that posted to it post nowhere. Returns
   * whether there was such a webhook.
   */
  async remove(id: string): Promise<boolean> {
    const { count } = await this.prisma.webhook.deleteMany({ where: { id } });
    return count > 0;
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
