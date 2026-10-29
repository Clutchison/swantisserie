import { Injectable } from '@nestjs/common';

const API = 'https://api.scryfall.com';
/** Search is limited to 2 requests per second: https://scryfall.com/docs/api/rate-limits */
const SEARCH_INTERVAL_MS = 500;
/** A 429 locks us out for 30 seconds, and ignoring it risks a ban. */
const RATE_LIMITED_WAIT_MS = 30_000;
const MAX_RATE_LIMITED_RETRIES = 3;
/** Scryfall requires an accurate User-Agent and an Accept header on every request. */
const HEADERS = {
  'User-Agent':
    'Swantisserie/1.0 (+https://github.com/Clutchison/swantisserie)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

/** The sizes of a card image we use, on cards.scryfall.io. */
export interface ScryfallImageUris {
  small: string;
  normal: string;
  large: string;
}

/** The fields of a Scryfall card object we use: https://scryfall.com/docs/api/cards */
export interface ScryfallCard {
  /** This printing. */
  id: string;
  /** The card's identity across printings; absent only on reversible cards, whose faces carry it. */
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  type_line: string;
  /** Absent when the faces define the colors, e.g. modal double-faced cards. */
  colors?: string[];
  cmc: number;
  /** Absent when each face has its own image (transform, modal_dfc). */
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
}

export interface ScryfallCardFace {
  name: string;
  /** Only on reversible cards, where the card itself has none. */
  oracle_id?: string;
  colors?: string[];
  image_uris?: ScryfallImageUris;
}

/** One page of a search's results (unique cards, 175 per page). */
export interface ScryfallSearchPage {
  totalCards: number;
  hasMore: boolean;
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

/** Scryfall failed for reasons of its own, not the query's: an outage or rate limiting. */
export class ScryfallUnavailableError extends Error {
  constructor(readonly status: number) {
    super(`Scryfall search failed: ${status}`);
  }
}

/** Scryfall's search API: the boundary faked in tests. */
export abstract class ScryfallClient {
  /**
   * The cards matching `query`, page by page (from 1), or null if none do.
   * Throws ScryfallRejectedSearchError if Scryfall can't run the query, and
   * ScryfallUnavailableError if Scryfall itself is in trouble.
   */
  abstract search(
    query: string,
    page?: number,
  ): Promise<ScryfallSearchPage | null>;
}

@Injectable()
export class FetchScryfallClient extends ScryfallClient {
  /** When the next search may start (ms since epoch). */
  private nextStart = 0;

  async search(query: string, page = 1): Promise<ScryfallSearchPage | null> {
    const url = new URL(`${API}/cards/search`);
    url.searchParams.set('q', query);
    if (page > 1) url.searchParams.set('page', String(page));

    for (let rateLimited = 0; ; rateLimited++) {
      await this.waitForTurn();
      const res = await fetch(url.toString(), { headers: HEADERS });
      if (res.status !== 429) return this.parse(res);
      if (rateLimited === MAX_RATE_LIMITED_RETRIES) {
        throw new ScryfallUnavailableError(res.status);
      }
      this.backOff();
    }
  }

  private async parse(res: Response): Promise<ScryfallSearchPage | null> {
    if (res.status === 404) return null;
    if (res.status === 400) {
      const error = (await res.json()) as ScryfallErrorBody;
      throw new ScryfallRejectedSearchError(
        error.details,
        error.warnings ?? [],
      );
    }
    if (!res.ok) throw new ScryfallUnavailableError(res.status);
    const body = (await res.json()) as {
      total_cards: number;
      has_more: boolean;
      data: ScryfallCard[];
      warnings?: string[];
    };
    return {
      totalCards: body.total_cards,
      hasMore: body.has_more,
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

  /** Holds every search, not just this one, until the lockout is over. */
  private backOff(): void {
    this.nextStart = Math.max(
      this.nextStart,
      Date.now() + RATE_LIMITED_WAIT_MS,
    );
  }
}
