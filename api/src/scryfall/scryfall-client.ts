import { Injectable } from '@nestjs/common';
import type { CardImages, Rarity } from 'contract';
import {
  fetchWithTimeout,
  UnreachableError,
} from '../http/fetch-with-timeout.js';

const API = 'https://api.scryfall.com';
/**
 * Search is limited to 2 requests per second
 * (https://scryfall.com/docs/api/rate-limits); the extra 100 ms keeps us
 * safely inside it.
 */
const REQUEST_INTERVAL_MS = 600;
/** A 429 locks us out for 30 seconds, and ignoring it risks a ban. */
const RATE_LIMITED_WAIT_MS = 30_000;
const MAX_RATE_LIMITED_RETRIES = 3;
/**
 * How long to wait before each retry after a server error, a timeout or a
 * network failure. Separate from the retries after a 429.
 */
const RETRY_DELAYS_MS = [1000, 2000, 4000];
/** How long a request, its body included, may take. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Scryfall requires an accurate User-Agent and an Accept header on every request. */
const HEADERS = {
  'User-Agent':
    'Swantisserie/1.0 (+https://github.com/Clutchison/swantisserie)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

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
  /** How the card's faces are laid out, e.g. normal, split, transform, adventure: https://scryfall.com/docs/api/layouts */
  layout: string;
  /** Absent when the faces define the colors, e.g. modal double-faced cards. */
  colors?: string[];
  cmc: number;
  /** Absent when the faces carry it, as on double-faced cards. */
  mana_cost?: string;
  /** Absent when the faces carry it. */
  oracle_text?: string;
  color_identity: string[];
  keywords: string[];
  rarity: Rarity;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  /** Absent when each face has its own image (transform, modal_dfc). */
  image_uris?: CardImages;
  card_faces?: ScryfallCardFace[];
}

export interface ScryfallCardFace {
  name: string;
  /** Only on reversible cards, where the card itself has none. */
  oracle_id?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  /** Absent when the card's colors apply, e.g. on adventures and split cards. */
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  image_uris?: CardImages;
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

/**
 * Scryfall failed for reasons of its own, not the query's: an outage, rate
 * limiting, or it couldn't be reached at all.
 */
export class ScryfallUnavailableError extends Error {
  constructor(
    /** The HTTP status Scryfall failed with, or undefined if it couldn't be reached. */
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(
      status === undefined
        ? 'Scryfall could not be reached.'
        : `Scryfall request failed: ${status}`,
      options,
    );
  }

  /** Scryfall couldn't be reached at all: a timeout or a network failure. */
  static unreachable(cause: unknown): ScryfallUnavailableError {
    return new ScryfallUnavailableError(undefined, { cause });
  }
}

/** The longest query Scryfall will search: https://scryfall.com/docs/api/cards/search */
const MAX_QUERY_LENGTH = 1000;

/** Scryfall's card API: the boundary faked in tests. */
export abstract class ScryfallClient {
  /**
   * The cards matching `query`, page by page (from 1), or null if none do.
   * Throws ScryfallRejectedSearchError if Scryfall can't run the query, and
   * ScryfallUnavailableError if Scryfall itself is in trouble or can't be
   * reached, even after retrying.
   */
  abstract search(
    query: string,
    page?: number,
  ): Promise<ScryfallSearchPage | null>;

  /**
   * A printing on `game` (as Scryfall's `game:` search names it) of each card
   * with one of these oracle ids, leaving out cards with none. Asks for as
   * many cards per search as Scryfall's query length allows. Throws
   * ScryfallUnavailableError if Scryfall itself is in trouble or can't be
   * reached, even after retrying.
   */
  abstract printingsOn(
    game: string,
    oracleIds: string[],
  ): Promise<ScryfallCard[]>;
}

@Injectable()
export class FetchScryfallClient extends ScryfallClient {
  /** When the next search may start (ms since epoch). */
  private nextStart = 0;

  async search(query: string, page = 1): Promise<ScryfallSearchPage | null> {
    const url = new URL(`${API}/cards/search`);
    url.searchParams.set('q', query);
    if (page > 1) url.searchParams.set('page', String(page));

    for (let failures = 0; ; failures++) {
      try {
        return await this.attempt(url.toString());
      } catch (err) {
        if (!isRetryable(err) || failures === RETRY_DELAYS_MS.length) throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[failures]),
      );
    }
  }

  async printingsOn(
    game: string,
    oracleIds: string[],
  ): Promise<ScryfallCard[]> {
    const cards: ScryfallCard[] = [];
    for (const query of oracleIdQueries(game, [...new Set(oracleIds)])) {
      for (let page = 1; ; page++) {
        const result = await this.search(query, page);
        if (!result) break;
        cards.push(...result.cards);
        if (!result.hasMore) break;
      }
    }
    return cards;
  }

  /** Sends the search and reads its answer, once. */
  private async attempt(url: string): Promise<ScryfallSearchPage | null> {
    try {
      return await this.parse(await this.send(url));
    } catch (err) {
      if (err instanceof UnreachableError) {
        throw ScryfallUnavailableError.unreachable(err);
      }
      throw err;
    }
  }

  /** Sends a request in its turn, waiting out rate limiting. */
  private async send(url: string): Promise<Response> {
    for (let rateLimited = 0; ; rateLimited++) {
      await this.waitForTurn();
      const res = await fetchWithTimeout(
        url,
        { headers: HEADERS },
        REQUEST_TIMEOUT_MS,
      );
      if (res.status !== 429) return res;
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

  /** Reserves the next free slot synchronously, so concurrent requests queue up. */
  private async waitForTurn(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.nextStart);
    this.nextStart = start + REQUEST_INTERVAL_MS;
    if (start > now) {
      await new Promise((resolve) => setTimeout(resolve, start - now));
    }
  }

  /** Holds every request, not just this one, until the lockout is over. */
  private backOff(): void {
    this.nextStart = Math.max(
      this.nextStart,
      Date.now() + RATE_LIMITED_WAIT_MS,
    );
  }
}

/** Whether a retry might help: a server error or no answer at all, but not rate limiting. */
function isRetryable(err: unknown): boolean {
  return (
    err instanceof ScryfallUnavailableError &&
    (err.status === undefined || err.status >= 500)
  );
}

/** Searches for a printing on `game` of each of the cards, each as long as Scryfall allows. */
function oracleIdQueries(game: string, oracleIds: string[]): string[] {
  const wrap = (terms: string[]) =>
    `(${terms.join(' or ')}) game:${game} unique:cards`;
  const queries: string[] = [];
  let terms: string[] = [];
  for (const oracleId of oracleIds) {
    const term = `oracleid:${oracleId}`;
    if (terms.length > 0 && wrap([...terms, term]).length > MAX_QUERY_LENGTH) {
      queries.push(wrap(terms));
      terms = [];
    }
    terms.push(term);
  }
  if (terms.length > 0) queries.push(wrap(terms));
  return queries;
}
