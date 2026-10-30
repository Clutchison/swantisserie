import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PRINTINGS_LIMIT,
  ScryfallClient,
} from '../scryfall/scryfall-client.js';
import { searchFields } from './pool-snapshot.service.js';

/**
 * Fills in the pool search fields of cards snapshotted before they were
 * stored, from their Arena printings, in the background after boot.
 */
@Injectable()
export class PoolBackfillService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PoolBackfillService.name);
  /** The backfill in flight, so shutdown can wait for its current batch. */
  private running: Promise<void> = Promise.resolve();
  /** Set on shutdown, so the backfill stops between batches. */
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
  ) {}

  /** If the backfill fails, the cards it hasn't reached are tried next boot. */
  onApplicationBootstrap(): void {
    this.running = this.backfill().catch((err: unknown) => {
      this.logger.error('Backfilling pool search fields failed', err);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.running;
  }

  /**
   * Leaves the rest of each card alone. A card Scryfall no longer has stays
   * as it was, and is tried again next boot.
   */
  private async backfill(): Promise<void> {
    // Rarity is null exactly on cards not yet backfilled.
    let lastScryfallId = '';
    while (!this.stopping) {
      const batch = await this.prisma.poolCard.findMany({
        where: { rarity: null, scryfallId: { gt: lastScryfallId } },
        distinct: ['scryfallId'],
        orderBy: { scryfallId: 'asc' },
        take: PRINTINGS_LIMIT,
        select: { scryfallId: true },
      });
      if (batch.length === 0) return;
      lastScryfallId = batch[batch.length - 1].scryfallId;
      const cards = await this.scryfall.printings(
        batch.map((card) => card.scryfallId),
      );
      await this.prisma.$transaction(
        cards.map((card) =>
          this.prisma.poolCard.updateMany({
            where: { scryfallId: card.id, rarity: null },
            data: searchFields(card),
          }),
        ),
      );
    }
  }
}
