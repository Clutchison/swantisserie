import { Injectable } from '@nestjs/common';

const API = 'https://api.scryfall.com';
/** Search is limited to 2 requests per second: https://scryfall.com/docs/api/rate-limits */
const SEARCH_INTERVAL_MS = 500;
/** Scryfall requires an accurate User-Agent and an Accept header on every request. */
const HEADERS = {
  'User-Agent':
    'Swantisserie/1.0 (+https://github.com/Clutchison/swantisserie)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

/** The fields of a Scryfall card object we use. */
export interface ScryfallCard {
  name: string;
}

/** One page of a search's results (unique cards, 175 per page). */
export interface ScryfallSearchPage {
  totalCards: number;
  cards: ScryfallCard[];
  /** Terms Scryfall ignored, e.g. unknown keywords. */
  warnings: string[];
}

/** https://scryfall.com/docs/api/errors */
interface ScryfallErrorBody {
  details: string;
  warnings?: string[] | null;
}

/** Scryfall rejected the query itself, e.g. for bad syntax. */
export class ScryfallRejectedSearchError extends Error {
  constructor(
    /** Scryfall's explanation, fit to show the user. */
    readonly details: string,
    readonly warnings: string[],
  ) {
    super(details);
  }
}

/** Scryfall's search API: the boundary faked in tests. */
export abstract class ScryfallClient {
  /**
   * The first page of cards matching `query`, or null if none do.
   * Throws ScryfallRejectedSearchError if Scryfall can't run the query.
   */
  abstract search(query: string): Promise<ScryfallSearchPage | null>;
}

@Injectable()
export class FetchScryfallClient extends ScryfallClient {
  /** When the next search may start (ms since epoch). */
  private nextStart = 0;

  async search(query: string): Promise<ScryfallSearchPage | null> {
    await this.waitForTurn();
    const url = new URL(`${API}/cards/search`);
    url.searchParams.set('q', query);
    const res = await fetch(url.toString(), { headers: HEADERS });
    if (res.status === 404) return null;
    if (res.status === 400) {
      const error = (await res.json()) as ScryfallErrorBody;
      throw new ScryfallRejectedSearchError(
        error.details,
        error.warnings ?? [],
      );
    }
    if (!res.ok) throw new Error(`Scryfall search failed: ${res.status}`);
    const body = (await res.json()) as {
      total_cards: number;
      data: ScryfallCard[];
      warnings?: string[];
    };
    return {
      totalCards: body.total_cards,
      cards: body.data,
      warnings: body.warnings ?? [],
    };
  }

  /** Reserves the next free slot synchronously, so concurrent searches queue up. */
  private async waitForTurn(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.nextStart);
    this.nextStart = start + SEARCH_INTERVAL_MS;
    if (start > now) {
      await new Promise((resolve) => setTimeout(resolve, start - now));
    }
  }
}
