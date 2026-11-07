import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { SetCatalogView, SetListEntryView, SetOptionView } from 'contract';
import type { Platform } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ScryfallClient,
  type ScryfallSet,
} from '../scryfall/scryfall-client.js';
import { NO_BASIC_LANDS } from '../drafts/basic-lands.js';
import { SCRYFALL_GAME } from '../drafts/platform.js';

/** The Scryfall set types of a main set, when it has no parent set. */
const MAIN_SET_TYPES = new Set([
  'expansion',
  'core',
  'masters',
  'draft_innovation',
]);
/** Sets that come with a main set but are never a sublist. */
const NEVER_SUBLISTS = new Set(['token', 'promo', 'memorabilia']);
/**
 * The types of a bonus sheet, which a set list includes unless the
 * organizer leaves it out: e.g. BIG (expansion), OTP and STA (masterpiece),
 * BOT (eternal), SIS (masters). Alchemy, Commander and other add-ons aren't.
 */
const BONUS_SHEET_TYPES = new Set([
  'expansion',
  'masterpiece',
  'eternal',
  'masters',
]);

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long Scryfall's list of sets is kept before it is fetched again. */
const SETS_MAX_AGE_MS = DAY_MS;
/** How long a set's count holds; a new set's cards on a platform change faster. */
const COUNT_MAX_AGE_MS = 7 * DAY_MS;
const NEW_SET_COUNT_MAX_AGE_MS = DAY_MS;
/** How long after release a set counts as new. */
const NEW_SET_MS = 90 * DAY_MS;

/** A main set and the sublists that may come with it, as Scryfall lists them. */
interface MainSet {
  set: ScryfallSet;
  sublists: ScryfallSet[];
}

/** A set's count of cards on a platform, as stored. */
interface StoredCount {
  setCode: string;
  cards: number;
  countedAt: Date;
}

/** A set or sublist in a set list the picker doesn't offer on the platform. */
export class SetNotOfferedError extends Error {}

/**
 * The Magic sets a set list can hold (`GLOSSARY.md`: Set list, Sublist), from
 * Scryfall, with how many cards each adds to a pool on each platform. Scryfall
 * has no count per platform, so each set's is a search of its own: they are
 * counted in the background when the picker first asks, kept in the
 * database, and counted again once stale.
 */
@Injectable()
export class SetCatalog implements OnApplicationShutdown {
  private readonly logger = new Logger(SetCatalog.name);
  private setList: { fetchedAt: number; sets: Promise<ScryfallSet[]> } | null =
    null;
  /** Counting in flight, by platform. */
  private readonly counting = new Map<Platform, Promise<void>>();
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
  ) {}

  /** Stops counting between sets, and waits for the count under way. */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await Promise.all(this.counting.values());
  }

  /**
   * The sets the picker offers on `platform`, newest first, as counted so
   * far. Starts counting any set not counted yet, or counted too long ago.
   * Throws ScryfallUnavailableError if Scryfall's list of sets can't be had.
   */
  async options(platform: Platform): Promise<SetCatalogView> {
    const mainSets = await this.mainSets();
    const counts = await this.counts(platform);
    const now = Date.now();
    const stale = mainSets.some(({ set, sublists }) =>
      [set, ...sublists].some((s) => isStale(s, counts.get(s.code), now)),
    );
    if (stale) this.countInBackground(platform, mainSets);
    return {
      sets: offered(mainSets, counts),
      counting: this.counting.has(platform),
    };
  }

  /**
   * The set list with only offered sets and sublists, each once, oldest set
   * first and each set's sublists by code. Throws SetNotOfferedError naming
   * the first set or sublist that isn't offered on `platform`.
   */
  async check(
    platform: Platform,
    setList: SetListEntryView[],
  ): Promise<SetListEntryView[]> {
    const sets = new Map(
      offered(await this.mainSets(), await this.counts(platform)).map((set) => [
        set.code,
        set,
      ]),
    );
    const checked = setList.map(({ code, sublists }) => {
      const set = sets.get(code);
      if (!set) {
        throw new SetNotOfferedError(
          `${code.toUpperCase()} isn’t a set with cards on ${platform}.`,
        );
      }
      const offeredSublists = new Set(set.sublists.map((s) => s.code));
      const missing = sublists.find((sublist) => !offeredSublists.has(sublist));
      if (missing !== undefined) {
        throw new SetNotOfferedError(
          `${missing.toUpperCase()} isn’t a sublist of ${code.toUpperCase()} with cards on ${platform}.`,
        );
      }
      return { set, sublists: [...new Set(sublists)].sort() };
    });
    return checked
      .sort((a, b) => a.set.releasedAt.localeCompare(b.set.releasedAt))
      .map(({ set, sublists }) => ({ code: set.code, sublists }));
  }

  /**
   * Every set and sublist in the set list by code, earliest released first:
   * the order in which a card takes its printing. A set comes before its own
   * sublists released the same day.
   */
  async printingOrder(setList: SetListEntryView[]): Promise<string[]> {
    const released = new Map<string, string>();
    for (const { set, sublists } of await this.mainSets()) {
      for (const s of [set, ...sublists]) released.set(s.code, s.releasedAt);
    }
    // Each code with where it stands in the set list, to break ties by.
    const codes = setList.flatMap(({ code, sublists }, setIndex) =>
      [code, ...sublists].map((listed, indexInSet) => ({
        code: listed,
        setIndex,
        indexInSet,
      })),
    );
    // A set Scryfall no longer lists goes last.
    const date = (code: string) => released.get(code) ?? '9999-12-31';
    return codes
      .sort(
        (a, b) =>
          date(a.code).localeCompare(date(b.code)) ||
          a.setIndex - b.setIndex ||
          a.indexInSet - b.indexInSet,
      )
      .map(({ code }) => code);
  }

  /**
   * Every Scryfall set, as fetched at most a day ago. Throws
   * ScryfallUnavailableError if Scryfall's list of sets can't be had.
   */
  scryfallSets(): Promise<ScryfallSet[]> {
    const now = Date.now();
    if (!this.setList || now - this.setList.fetchedAt > SETS_MAX_AGE_MS) {
      const sets = this.scryfall.sets();
      // A failure is not kept, so the next request asks Scryfall again.
      sets.catch(() => {
        if (this.setList?.sets === sets) this.setList = null;
      });
      this.setList = { fetchedAt: now, sets };
    }
    return this.setList.sets;
  }

  /** Scryfall's main sets, newest first, each with its possible sublists. */
  private async mainSets(): Promise<MainSet[]> {
    return toMainSets(await this.scryfallSets());
  }

  private async counts(platform: Platform): Promise<Map<string, StoredCount>> {
    const rows = await this.prisma.setCardCount.findMany({
      where: { platform },
      select: { setCode: true, cards: true, countedAt: true },
    });
    return new Map(rows.map((row) => [row.setCode, row]));
  }

  private countInBackground(platform: Platform, mainSets: MainSet[]): void {
    if (this.counting.has(platform) || this.stopping) return;
    const job = this.count(platform, mainSets)
      .catch((err: unknown) => {
        this.logger.error(
          `Counting the sets' cards on ${platform} failed`,
          err,
        );
      })
      .finally(() => this.counting.delete(platform));
    this.counting.set(platform, job);
  }

  /** Counts each stale set's cards on the platform, newest set first, each followed by its sublists. */
  private async count(platform: Platform, mainSets: MainSet[]): Promise<void> {
    const counts = await this.counts(platform);
    for (const { set, sublists } of mainSets) {
      for (const s of [set, ...sublists]) {
        if (this.stopping) return;
        if (!isStale(s, counts.get(s.code), Date.now())) continue;
        const found = await this.scryfall.search(
          `e:${s.code} ${NO_BASIC_LANDS} in:${SCRYFALL_GAME[platform]} unique:cards`,
          1,
        );
        const row = {
          cards: found?.totalCards ?? 0,
          countedAt: new Date(),
        };
        await this.prisma.setCardCount.upsert({
          where: { platform_setCode: { platform, setCode: s.code } },
          create: { platform, setCode: s.code, ...row },
          update: row,
        });
      }
    }
  }
}

/** The main sets, newest first, each with the sets that may be its sublists. */
function toMainSets(sets: ScryfallSet[]): MainSet[] {
  const mainSets = sets
    .filter((set) => MAIN_SET_TYPES.has(set.setType) && !set.parentSetCode)
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
  return mainSets.map((set) => ({
    set,
    sublists: sets.filter(
      (sublist) =>
        sublist.parentSetCode === set.code &&
        !NEVER_SUBLISTS.has(sublist.setType),
    ),
  }));
}

/** The main sets with cards on the platform, each with its sublists that have some. */
function offered(
  mainSets: MainSet[],
  counts: Map<string, StoredCount>,
): SetOptionView[] {
  const cards = (code: string) => counts.get(code)?.cards ?? 0;
  return mainSets
    .filter(({ set }) => cards(set.code) > 0)
    .map(({ set, sublists }) => ({
      code: set.code,
      name: set.name,
      releasedAt: set.releasedAt,
      cards: cards(set.code),
      sublists: sublists
        .filter((sublist) => cards(sublist.code) > 0)
        .map((sublist) => ({
          code: sublist.code,
          name: sublist.name,
          cards: cards(sublist.code),
          includedByDefault: BONUS_SHEET_TYPES.has(sublist.setType),
        })),
    }));
}

/** Whether the set needs counting: never counted, or counted too long ago. */
function isStale(
  set: ScryfallSet,
  count: StoredCount | undefined,
  now: number,
): boolean {
  if (!count) return true;
  const isNew = now - Date.parse(set.releasedAt) < NEW_SET_MS;
  const maxAge = isNew ? NEW_SET_COUNT_MAX_AGE_MS : COUNT_MAX_AGE_MS;
  return now - count.countedAt.getTime() > maxAge;
}
