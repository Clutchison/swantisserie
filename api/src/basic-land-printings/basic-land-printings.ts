import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  BASIC_LANDS,
  type BasicLand,
  type BasicLandPrintingSetView,
  type BasicLandPrintingView,
  type CardImages,
} from 'contract';
import type { BasicLandPrinting } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type ScryfallCard,
  ScryfallClient,
  type ScryfallSet,
} from '../scryfall/scryfall-client.js';
import { SetCatalog } from '../sets/set-catalog.js';

/** The one row that says when the last refresh to finish started. */
const REFRESH_ID = 1;
/** What a printing's set is stored as when Scryfall's list of sets lacks it, as the migration that first stored printings did. */
const UNKNOWN_RELEASE = '1993-08-05';

/**
 * Every English printing of each basic land with a single-faced image, kept
 * in the database for the Printing picker and preferred printings, so
 * neither asks Scryfall (ADR 0015). Asking for a land's printings answers at
 * once from what is stored, and starts a refresh from Scryfall in the
 * background when there is none yet or a set has been released since the
 * last refresh started. A refresh upserts and never deletes, so a preferred
 * printing never loses its printing.
 */
@Injectable()
export class BasicLandPrintings implements OnApplicationShutdown {
  private readonly logger = new Logger(BasicLandPrintings.name);
  /** The check for a refresh, and the refresh it starts, while under way. */
  private refreshing: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
    private readonly catalog: SetCatalog,
  ) {}

  /** Stops refreshing between searches, and waits for the search under way. */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.refreshing;
  }

  /**
   * The stored printings of `land`, grouped by set: the newest set first,
   * each set's printings in collector-number order. Starts a refresh in the
   * background if one is due, without waiting for it.
   */
  async sets(land: BasicLand): Promise<BasicLandPrintingSetView[]> {
    this.refreshInBackground();
    const rows = await this.prisma.basicLandPrinting.findMany({
      where: { land },
      orderBy: [{ setReleasedAt: 'desc' }, { setName: 'asc' }],
    });
    return bySet(rows);
  }

  /** Whether `scryfallId` is a stored printing of `land`. */
  async isPrintingOf(land: BasicLand, scryfallId: string): Promise<boolean> {
    const printing = await this.prisma.basicLandPrinting.findUnique({
      where: { scryfallId },
      select: { land: true },
    });
    return printing?.land === land;
  }

  /** Checks whether a refresh is due, and runs it if so, unless a check or refresh is under way already. */
  private refreshInBackground(): void {
    if (this.refreshing || this.stopping) return;
    this.refreshing = this.refreshIfDue()
      .catch((err: unknown) => {
        this.logger.error('Refreshing the basic land printings failed', err);
      })
      .finally(() => (this.refreshing = null));
  }

  private async refreshIfDue(): Promise<void> {
    const last = await this.prisma.basicLandPrintingRefresh.findUnique({
      where: { id: REFRESH_ID },
    });
    const due =
      !last ||
      (await this.prisma.basicLandPrinting.count()) === 0 ||
      releasedSince(await this.catalog.scryfallSets(), last.startedAt);
    if (due) await this.refresh();
  }

  /**
   * Reads each basic land's printings with Scryfall's search, a page at a
   * time, and upserts them. Notes when it started only once it finishes,
   * so one that fails or stops at shutdown runs again on the next request.
   */
  private async refresh(): Promise<void> {
    const startedAt = new Date();
    const sets = new Map(
      (await this.catalog.scryfallSets()).map((set) => [set.code, set]),
    );
    for (const land of BASIC_LANDS) {
      for (let page = 1; ; page++) {
        if (this.stopping) return;
        const found = await this.scryfall.search(
          `!"${land}" lang:en unique:prints`,
          page,
        );
        if (!found) break;
        const rows = found.cards
          .map((card) => printingRow(land, card, sets))
          .filter((row) => row !== null);
        await this.prisma.$transaction(
          rows.map((row) =>
            this.prisma.basicLandPrinting.upsert({
              where: { scryfallId: row.scryfallId },
              create: row,
              update: row,
            }),
          ),
        );
        if (!found.hasMore) break;
      }
    }
    await this.prisma.basicLandPrintingRefresh.upsert({
      where: { id: REFRESH_ID },
      create: { id: REFRESH_ID, startedAt },
      update: { startedAt },
    });
  }
}

/**
 * Whether a set in Scryfall's list was released after the day `since` and
 * by today. A set still in spoiler season waits for its release, when its
 * basic lands are complete.
 */
function releasedSince(sets: ScryfallSet[], since: Date): boolean {
  const sinceDay = since.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return sets.some(
    (set) => set.releasedAt > sinceDay && set.releasedAt <= today,
  );
}

/** The card as a stored printing of `land`, or null if it isn't one to store. */
function printingRow(
  land: BasicLand,
  card: ScryfallCard,
  sets: Map<string, ScryfallSet>,
): BasicLandPrinting | null {
  const images = card.image_uris;
  if (card.name !== land || card.lang !== 'en' || !images || !onCdn(images)) {
    return null;
  }
  const set = sets.get(card.set);
  return {
    scryfallId: card.id,
    land,
    setCode: card.set,
    setName: set?.name ?? card.set.toUpperCase(),
    setReleasedAt: new Date(set?.releasedAt ?? UNKNOWN_RELEASE),
    collectorNumber: card.collector_number,
    imageSmall: images.small,
    imageNormal: images.normal,
    imageLarge: images.large,
  };
}

/** Whether every image is on Scryfall's CDN, which the web loads images from directly. */
function onCdn(images: CardImages): boolean {
  return [images.small, images.normal, images.large].every((url) =>
    url.startsWith('https://cards.scryfall.io/'),
  );
}

/** The printings, newest set first, grouped by set, each set's in collector-number order. */
function bySet(rows: BasicLandPrinting[]): BasicLandPrintingSetView[] {
  const sets = new Map<string, BasicLandPrintingSetView>();
  for (const row of rows) {
    let set = sets.get(row.setCode);
    if (!set) {
      set = {
        code: row.setCode,
        name: row.setName,
        releasedAt: row.setReleasedAt.toISOString().slice(0, 10),
        printings: [],
      };
      sets.set(row.setCode, set);
    }
    set.printings.push(printingView(row));
  }
  const byNumber = new Intl.Collator('en', { numeric: true });
  for (const set of sets.values()) {
    set.printings.sort((a, b) =>
      byNumber.compare(a.collectorNumber, b.collectorNumber),
    );
  }
  return [...sets.values()];
}

/** A stored printing as the contract shows it. */
export function printingView(
  printing: BasicLandPrinting,
): BasicLandPrintingView {
  return {
    scryfallId: printing.scryfallId,
    set: printing.setCode,
    collectorNumber: printing.collectorNumber,
    images: {
      small: printing.imageSmall,
      normal: printing.imageNormal,
      large: printing.imageLarge,
    },
  };
}
