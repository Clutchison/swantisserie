import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type {
  Platform,
  PoolSourceKind,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ScryfallClient,
  type ScryfallCard,
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
} from '../scryfall/scryfall-client.js';
import { NO_BASIC_LANDS } from './basic-lands.js';
import { SCRYFALL_GAME } from './platform.js';
import { NoOracleIdError, toPoolCard } from './pool-card.js';
import { storedSetList } from './pool-source.js';
import { setListPrintings } from './set-list-pool.js';
import { SetCatalog } from '../sets/set-catalog.js';

/** A draft's pool source and its platform: what the pool is snapshotted from. */
interface SnapshotSource {
  poolSourceKind: PoolSourceKind;
  /** Set for a pool query, by the database's check constraints. */
  poolQuery: string | null;
  /** Set for a set list, by the database's check constraints. */
  setList: Prisma.JsonValue;
  platform: Platform;
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
 * Copies the pool of each draft defined by a pool query or a set list from
 * Scryfall in the background: the pool snapshot. Progress lives on the draft (snapshotState,
 * poolTotal, snapshotError) and in its PoolCard rows. A draft defined by a
 * cube link has its snapshot taken whole when it is created, never here.
 */
@Injectable()
export class PoolSnapshotService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PoolSnapshotService.name);
  /** Snapshots in flight in this process, by draft id. */
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
    private readonly sets: SetCatalog,
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

  /**
   * Lets snapshots finish before the database goes away, including those
   * that requests started while the HTTP server was closing. Runs after it
   * has closed, and before PrismaService disconnects.
   */
  async onApplicationShutdown(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all(this.running.values());
    }
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
    let source: SnapshotSource | null;
    try {
      source = await this.reset(draftId);
    } catch (err) {
      started.reject(err);
      return;
    }
    started.resolve();
    if (source === null) return;

    try {
      await this.takeCards(draftId, source);
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
  private async reset(draftId: string): Promise<SnapshotSource | null> {
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
        select: {
          poolSourceKind: true,
          poolQuery: true,
          setList: true,
          platform: true,
        },
      });
    });
  }

  /** Takes the draft's cards in the way its kind of pool source is taken. */
  private async takeCards(
    draftId: string,
    { poolSourceKind: kind, poolQuery, setList, platform }: SnapshotSource,
  ): Promise<void> {
    switch (kind) {
      case 'PoolQuery':
        return this.pageThrough(draftId, poolQuery ?? '', platform);
      case 'SetList':
        return this.takeSetList(draftId, setList, platform);
      case 'Cube':
        // A cube link's pool is complete from creation; only a draft left
        // unfinished by an older version gets here.
        throw new PoolSnapshotError(
          'A pool from a cube link is taken only when its draft is created. Cancel this draft and create it again.',
        );
      default: {
        const unhandled: never = kind;
        throw new Error(`Unknown pool source kind ${String(unhandled)}.`);
      }
    }
  }

  private async takeSetList(
    draftId: string,
    setList: Prisma.JsonValue,
    platform: Platform,
  ): Promise<void> {
    const codes = await this.sets.printingOrder(storedSetList(setList));
    const total = await takeSetListCards(
      this.prisma,
      setListPrintings(this.scryfall, codes, SCRYFALL_GAME[platform]),
      draftId,
    );
    if (total === 0) {
      throw new PoolSnapshotError(
        `The set list no longer has any cards on ${platform}.`,
      );
    }
    await this.prisma.draft.update({
      where: { id: draftId },
      data: { poolTotal: total },
    });
  }

  private async pageThrough(
    draftId: string,
    poolQuery: string,
    platform: Platform,
  ): Promise<void> {
    // game:arena picks the Arena printing of each card, game:mtgo the MTGO
    // one; the pool query was already checked to have no cards off the
    // platform. The basic lands are left out: a plan adds them by count.
    const query = `(${poolQuery}) ${NO_BASIC_LANDS} game:${SCRYFALL_GAME[platform]} unique:cards`;
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
          data: result.cards.map((card) => ({ draftId, ...toPoolCard(card) })),
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

/**
 * Takes a set list's cards set by set, in the order they take their
 * printings: a pool of several large sets is a few dozen searches, too
 * long to wait for while the draft is created.
 */
async function takeSetListCards(
  prisma: PrismaService,
  pages: AsyncGenerator<ScryfallCard[]>,
  draftId: string,
): Promise<number> {
  let total = 0;
  for await (const cards of pages) {
    if (cards.length === 0) continue;
    await prisma.poolCard.createMany({
      data: cards.map((card) => ({ draftId, ...toPoolCard(card) })),
    });
    total += cards.length;
  }
  return total;
}

/** What the organizer is told of a failure with no explanation of its own. */
export const UNEXPECTED_SNAPSHOT_FAILURE =
  'Snapshotting the pool failed unexpectedly.';

/** A failure's explanation, fit to show the organizer. */
function explain(err: unknown): string {
  if (err instanceof PoolSnapshotError || err instanceof NoOracleIdError) {
    return err.message;
  }
  if (err instanceof ScryfallRejectedSearchError) {
    return `Scryfall rejected the pool query: ${err.details}`;
  }
  if (err instanceof ScryfallUnavailableError) {
    return 'Scryfall could not be reached.';
  }
  return UNEXPECTED_SNAPSHOT_FAILURE;
}
