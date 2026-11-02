import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { CardFace, CardImages } from 'contract';
import type { Platform, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ScryfallClient,
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
  type ScryfallCard,
  type ScryfallCardFace,
} from '../scryfall/scryfall-client.js';
import { SCRYFALL_GAME } from './platform.js';
import {
  CubeCobraClient,
  CubeCobraUnavailableError,
} from '../cubecobra/cubecobra-client.js';
import { cubePrintings } from './cube-pool.js';
import { notOnPlatformSentence } from './draft-errors.js';

/** A draft's pool source, as it keeps it, and its platform: what the pool is snapshotted from. */
interface PoolSource {
  poolQuery: string | null;
  cubeId: string | null;
  platform: Platform;
}

/** A card face's images, as stored in PoolCard.images. */
interface StoredCardImages extends CardImages {
  /** Keeps the type a Prisma InputJsonObject. */
  [key: string]: string;
}

/** One face's fields for the pool search, as stored in PoolCard.faces. */
interface StoredCardFace extends CardFace {
  /** Keeps the type a Prisma InputJsonObject. */
  [key: string]: string | string[] | null;
}

/** The pool snapshot is complete, so the pool can't change any more. */
export class PoolFrozenError extends Error {
  constructor() {
    super('The pool is complete and can’t be changed.');
  }
}

/** A snapshot failure with an explanation fit to show the organizer. */
class PoolSnapshotError extends Error {}

/**
 * Copies each draft's pool from Scryfall in the background, from its pool
 * query or from its cube as CubeCobra now has it: the pool snapshot. Progress lives on the draft (snapshotState, poolTotal,
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
    private readonly cubeCobra: CubeCobraClient,
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
   * Rejects with PoolFrozenError if the snapshot is already complete.
   */
  start(draftId: string): Promise<void> {
    if (this.running.has(draftId)) return Promise.resolve();
    let started!: { resolve: () => void; reject: (err: unknown) => void };
    const startedPromise = new Promise<void>((resolve, reject) => {
      started = { resolve, reject };
    });
    const job = this.run(draftId, started)
      .catch((err: unknown) => {
        this.logger.error(`Pool snapshot for draft ${draftId} crashed`, err);
      })
      .finally(() => this.running.delete(draftId));
    this.running.set(draftId, job);
    return startedPromise;
  }

  private async run(
    draftId: string,
    started: { resolve: () => void; reject: (err: unknown) => void },
  ): Promise<void> {
    let source: PoolSource | null;
    try {
      source = await this.reset(draftId);
    } catch (err) {
      started.reject(err);
      return;
    }
    started.resolve();
    if (source === null) return;

    try {
      if (source.cubeId !== null) {
        await this.copyCube(draftId, source.cubeId, source.platform);
      } else if (source.poolQuery !== null) {
        await this.pageThrough(draftId, source.poolQuery, source.platform);
      } else {
        // The schema rules this out; fail loudly rather than complete an empty pool.
        throw new Error(`Draft ${draftId} has no pool source.`);
      }
      await this.prisma.draft.update({
        where: { id: draftId },
        data: { snapshotState: 'Complete' },
      });
    } catch (err) {
      const { count } = await this.prisma.draft.updateMany({
        where: { id: draftId },
        data: { snapshotState: 'Failed', snapshotError: explain(err) },
      });
      // No draft left: it was cancelled, which is what stopped the snapshot.
      if (count > 0) {
        this.logger.error(`Pool snapshot for draft ${draftId} failed`, err);
      }
    }
  }

  /**
   * Marks the draft Running and drops its cards, unless its pool is already
   * frozen. Returns its pool source, or null if it was cancelled.
   */
  private async reset(draftId: string): Promise<PoolSource | null> {
    return this.prisma.$transaction(async (tx) => {
      // The state check and the reset are one statement, so a snapshot that
      // completes in the meantime can't be wiped.
      const { count } = await tx.draft.updateMany({
        where: { id: draftId, snapshotState: { not: 'Complete' } },
        data: {
          snapshotState: 'Running',
          poolTotal: null,
          snapshotError: null,
        },
      });
      if (count === 0) {
        if (await tx.draft.count({ where: { id: draftId } })) {
          throw new PoolFrozenError();
        }
        return null;
      }
      await tx.poolCard.deleteMany({ where: { draftId } });
      return tx.draft.findUniqueOrThrow({
        where: { id: draftId },
        select: { poolQuery: true, cubeId: true, platform: true },
      });
    });
  }

  /**
   * Copies the cube's mainboard as CubeCobra has it now, each card in a
   * printing on the platform. Fails if any card has none, as creation would.
   */
  private async copyCube(
    draftId: string,
    cubeId: string,
    platform: Platform,
  ): Promise<void> {
    const cube = await this.cubeCobra.cube(cubeId);
    if (!cube) {
      throw new PoolSnapshotError(
        'CubeCobra no longer has this cube, or it is no longer public.',
      );
    }
    if (cube.mainboard.length === 0) {
      throw new PoolSnapshotError(
        'The cube no longer has any mainboard cards.',
      );
    }
    const { printings, missing } = await cubePrintings(
      this.scryfall,
      cube,
      platform,
    );
    if (missing.length > 0) {
      throw new PoolSnapshotError(
        `${notOnPlatformSentence(missing.length, 'in the cube', platform)}: ${missing.join(', ')}.`,
      );
    }
    // The total and the cards land together, so a failed snapshot shows no
    // total for a pool it could never make.
    await this.prisma.$transaction([
      this.prisma.poolCard.createMany({
        data: printings.map((card) => toPoolCard(draftId, card)),
      }),
      this.prisma.draft.update({
        where: { id: draftId },
        data: { poolTotal: printings.length },
      }),
    ]);
  }

  private async pageThrough(
    draftId: string,
    poolQuery: string,
    platform: Platform,
  ): Promise<void> {
    // game:arena picks the Arena printing of each card, game:mtgo the MTGO
    // one; the pool query was already checked to have no cards off the
    // platform.
    const query = `(${poolQuery}) game:${SCRYFALL_GAME[platform]} unique:cards`;
    for (let page = 1; ; page++) {
      const result = await this.scryfall.search(query, page);
      if (!result) {
        throw new PoolSnapshotError(
          page === 1
            ? `The pool query no longer matches any cards on ${platform}.`
            : 'Scryfall stopped returning cards before the pool was complete.',
        );
      }
      await this.prisma.$transaction([
        this.prisma.poolCard.createMany({
          data: result.cards.map((card) => toPoolCard(draftId, card)),
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
  if (err instanceof PoolSnapshotError) return err.message;
  if (err instanceof ScryfallRejectedSearchError) {
    return `Scryfall rejected the pool query: ${err.details}`;
  }
  if (err instanceof ScryfallUnavailableError) {
    return 'Scryfall could not be reached.';
  }
  if (err instanceof CubeCobraUnavailableError) {
    return 'CubeCobra could not be reached.';
  }
  return 'Snapshotting the pool failed unexpectedly.';
}

function toPoolCard(
  draftId: string,
  card: ScryfallCard,
): Prisma.PoolCardCreateManyInput {
  const faces = card.card_faces ?? [];
  const oracleId = card.oracle_id ?? faces[0]?.oracle_id;
  if (!oracleId) throw new PoolSnapshotError(`${card.name} has no oracle id.`);
  const images: StoredCardImages[] = (
    card.image_uris ? [card.image_uris] : faces.map((face) => face.image_uris)
  )
    .filter((uris): uris is CardImages => !!uris)
    .map(({ small, normal, large }) => ({ small, normal, large }));
  return {
    draftId,
    scryfallId: card.id,
    oracleId,
    name: card.name,
    set: card.set,
    collectorNumber: card.collector_number,
    typeLine: card.type_line,
    colors: card.colors ?? [
      ...new Set(faces.flatMap((face) => face.colors ?? [])),
    ],
    manaValue: card.cmc,
    ...searchFields(card),
    images,
  };
}

/** The fields the pool search needs: all the backfill fills in. */
export function searchFields(card: ScryfallCard) {
  return {
    manaCost: card.mana_cost ?? null,
    oracleText: card.oracle_text ?? null,
    colorIdentity: card.color_identity,
    keywords: card.keywords,
    rarity: card.rarity,
    layout: card.layout,
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    loyalty: card.loyalty ?? null,
    defense: card.defense ?? null,
    faces: (card.card_faces ?? []).map(toCardFace),
  } satisfies Prisma.PoolCardUpdateInput;
}

function toCardFace(face: ScryfallCardFace): StoredCardFace {
  return {
    name: face.name,
    typeLine: face.type_line ?? null,
    oracleText: face.oracle_text ?? null,
    manaCost: face.mana_cost ?? null,
    colors: face.colors ?? null,
    power: face.power ?? null,
    toughness: face.toughness ?? null,
    loyalty: face.loyalty ?? null,
    defense: face.defense ?? null,
  };
}
