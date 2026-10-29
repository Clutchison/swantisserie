import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ScryfallClient,
  ScryfallRejectedSearchError,
  type ScryfallCard,
  type ScryfallImageUris,
} from '../scryfall/scryfall-client.js';

/** Image URLs of one card face, as stored in PoolCard.images. */
export interface CardImages extends ScryfallImageUris {
  /** Keeps the type a Prisma InputJsonObject. */
  [key: string]: string;
}

/**
 * Copies each draft's pool from Scryfall in the background: the pool
 * snapshot. Progress lives on the draft (snapshotState, poolTotal,
 * snapshotError) and in its PoolCard rows.
 */
@Injectable()
export class PoolSnapshotService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PoolSnapshotService.name);
  /** Snapshots in flight in this process, by draft id. */
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
  ) {}

  /**
   * Picks up snapshots a previous process left unfinished. If that fails the
   * app still starts: the drafts stay Running and are picked up next boot,
   * or the organizer retries.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const unfinished = await this.prisma.draft.findMany({
        where: { snapshotState: 'Running' },
        select: { id: true },
      });
      for (const { id } of unfinished) void this.start(id);
    } catch (err) {
      this.logger.error('Could not resume unfinished pool snapshots', err);
    }
  }

  /** Lets snapshots finish before the database goes away. */
  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.running.values());
  }

  /**
   * Starts the draft's snapshot over. Resolves once the draft is marked
   * Running and its old cards are gone; the paging carries on in the
   * background. Does nothing if this process is already snapshotting it.
   */
  start(draftId: string): Promise<void> {
    if (this.running.has(draftId)) return Promise.resolve();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    const job = this.run(draftId, markStarted)
      .catch((err: unknown) => {
        this.logger.error(`Pool snapshot for draft ${draftId} crashed`, err);
      })
      .finally(() => {
        markStarted();
        this.running.delete(draftId);
      });
    this.running.set(draftId, job);
    return started;
  }

  private async run(draftId: string, markStarted: () => void): Promise<void> {
    const draft = await this.prisma.draft.findUniqueOrThrow({
      where: { id: draftId },
      select: { poolQuery: true },
    });
    await this.prisma.$transaction([
      this.prisma.poolCard.deleteMany({ where: { draftId } }),
      this.prisma.draft.update({
        where: { id: draftId },
        data: {
          snapshotState: 'Running',
          poolTotal: null,
          snapshotError: null,
        },
      }),
    ]);
    markStarted();

    try {
      await this.pageThrough(draftId, draft.poolQuery);
      await this.prisma.draft.update({
        where: { id: draftId },
        data: { snapshotState: 'Complete' },
      });
    } catch (err) {
      this.logger.error(`Pool snapshot for draft ${draftId} failed`, err);
      await this.prisma.draft.update({
        where: { id: draftId },
        data: { snapshotState: 'Failed', snapshotError: explain(err) },
      });
    }
  }

  private async pageThrough(draftId: string, poolQuery: string): Promise<void> {
    // game:arena picks the Arena printing of each card; the pool query was
    // already checked to have no cards off Arena.
    const query = `(${poolQuery}) game:arena unique:cards`;
    for (let page = 1; ; page++) {
      const result = await this.scryfall.search(query, page);
      if (!result) {
        if (page > 1) return;
        throw new Error('The pool query no longer matches any cards on Arena.');
      }
      await this.prisma.$transaction([
        this.prisma.poolCard.createMany({
          data: result.cards.map((card) => toPoolCard(draftId, card)),
          skipDuplicates: true,
        }),
        this.prisma.draft.update({
          where: { id: draftId },
          data: { poolTotal: result.totalCards },
        }),
      ]);
      if (!result.hasMore) return;
    }
  }
}

/** A failure's explanation, fit to show the organizer. */
function explain(err: unknown): string {
  if (err instanceof ScryfallRejectedSearchError) {
    return `Scryfall rejected the pool query: ${err.details}`;
  }
  return err instanceof Error &&
    !err.message.startsWith('Scryfall search failed')
    ? err.message
    : 'Scryfall could not be reached.';
}

function toPoolCard(
  draftId: string,
  card: ScryfallCard,
): Prisma.PoolCardCreateManyInput {
  const faces = card.card_faces ?? [];
  const images: CardImages[] = (
    card.image_uris ? [card.image_uris] : faces.map((face) => face.image_uris)
  )
    .filter((uris): uris is ScryfallImageUris => !!uris)
    .map(({ small, normal, large }) => ({ small, normal, large }));
  return {
    draftId,
    scryfallId: card.id,
    oracleId: card.oracle_id ?? faces[0]?.oracle_id ?? card.id,
    name: card.name,
    set: card.set,
    collectorNumber: card.collector_number,
    typeLine: card.type_line,
    colors: card.colors ?? [
      ...new Set(faces.flatMap((face) => face.colors ?? [])),
    ],
    manaValue: card.cmc,
    images,
  };
}
