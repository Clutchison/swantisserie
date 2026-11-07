import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { BasicLand, BasicLandPrintingView, CardImages } from 'contract';
import { firstValueFrom } from 'rxjs';

/**
 * Searches are limited to 2 a second (`docs/research/scryfall.md`); the
 * extra 100 ms keeps us safely inside it.
 */
const SEARCH_INTERVAL_MS = 600;

/** The fields of a Scryfall card object the Printing picker uses: https://scryfall.com/docs/api/cards */
interface ScryfallPrinting {
  id: string;
  name: string;
  lang: string;
  set: string;
  set_name: string;
  collector_number: string;
  /** When the printing was released, as `YYYY-MM-DD`. */
  released_at: string;
  image_uris?: CardImages;
}

/** One page of a Scryfall search's results. */
interface ScryfallPage {
  data: ScryfallPrinting[];
  has_more: boolean;
  next_page?: string;
}

/** A set with at least one English printing of a basic land, and those printings. */
export interface PrintingSet {
  /** Scryfall's set code, e.g. `khm`. */
  code: string;
  name: string;
  /** The year the set was released. */
  year: string;
  /** In collector-number order. */
  printings: BasicLandPrintingView[];
}

/**
 * Every English printing of each basic land, read from Scryfall's search in
 * the browser for the Printing picker, only as it opens. Each land's are
 * read once a page, and again only after a failure.
 */
@Injectable({ providedIn: 'root' })
export class BasicLandPrintings {
  private readonly http = inject(HttpClient);
  private readonly read = new Map<BasicLand, Promise<PrintingSet[]>>();
  /** When the next search may start (ms since epoch). */
  private nextStart = 0;

  /**
   * The sets with an English printing of `land`, newest first, each with
   * those printings. Rejects if Scryfall fails, and reads again next time.
   */
  sets(land: BasicLand): Promise<PrintingSet[]> {
    let sets = this.read.get(land);
    if (!sets) {
      sets = this.search(land).then(bySet);
      sets.catch(() => this.read.delete(land));
      this.read.set(land, sets);
    }
    return sets;
  }

  /** Every English printing of `land`, page by page. */
  private async search(land: BasicLand): Promise<ScryfallPrinting[]> {
    const query = encodeURIComponent(`!"${land}" lang:en`);
    let url: string | undefined =
      `https://api.scryfall.com/cards/search?q=${query}&unique=prints&order=released&dir=desc`;
    const printings: ScryfallPrinting[] = [];
    while (url) {
      await this.waitForTurn();
      const page: ScryfallPage = await firstValueFrom(this.http.get<ScryfallPage>(url));
      printings.push(...page.data);
      url = page.has_more ? page.next_page : undefined;
    }
    return printings.filter(
      (printing) => printing.name === land && printing.lang === 'en' && printing.image_uris,
    );
  }

  /** Waits until a search may start, reserving the next slot at once. */
  private async waitForTurn(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.nextStart);
    this.nextStart = start + SEARCH_INTERVAL_MS;
    if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
  }
}

/** The printings grouped by set: the newest set first, each set's printings in collector-number order. */
function bySet(printings: ScryfallPrinting[]): PrintingSet[] {
  /** Each set, by code, with when its latest printing here was released. */
  const sets = new Map<string, { set: PrintingSet; released: string }>();
  for (const printing of printings) {
    let entry = sets.get(printing.set);
    if (!entry) {
      entry = {
        set: { code: printing.set, name: printing.set_name, year: '', printings: [] },
        released: '',
      };
      sets.set(printing.set, entry);
    }
    if (printing.released_at > entry.released) {
      entry.released = printing.released_at;
      entry.set.year = printing.released_at.slice(0, 4);
    }
    entry.set.printings.push({
      scryfallId: printing.id,
      set: printing.set,
      collectorNumber: printing.collector_number,
      images: printing.image_uris!,
    });
  }
  const byNumber = new Intl.Collator('en', { numeric: true });
  for (const { set } of sets.values()) {
    set.printings.sort((a, b) => byNumber.compare(a.collectorNumber, b.collectorNumber));
  }
  return [...sets.values()]
    .sort((a, b) => b.released.localeCompare(a.released) || a.set.name.localeCompare(b.set.name))
    .map(({ set }) => set);
}
