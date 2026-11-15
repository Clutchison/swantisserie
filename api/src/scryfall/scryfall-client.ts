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
  /** The printing's language, e.g. `en`. */
  lang: string;
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

/** One page of a search's results, 175 cards or printings per page. */
export interface ScryfallSearchPage {
  totalCards: number;
  hasMore: boolean;
  cards: ScryfallCard[];
  /** Terms Scryfall ignored, e.g. unknown keywords. */
  warnings: string[];
}

/** A Scryfall set, with the fields we use: https://scryfall.com/docs/api/sets */
export interface ScryfallSet {
  /** Lowercase, as `e:` searches take it. */
  code: string;
  name: string;
  /** Scryfall's set type, e.g. expansion, masterpiece, alchemy, token. */
  setType: string;
  /** The set it comes with, for a set that comes with another; else null. */
  parentSetCode: string | null;
  /** YYYY-MM-DD. */
  releasedAt: string;
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
    /** Its `message`, if given, replaces the one `status` gives. */
    options: ErrorOptions & { message?: string } = {},
  ) {
    super(
      options.message ??
        (status === undefined
          ? 'Scryfall could not be reached.'
          : `Scryfall request failed: ${status}`),
      options,
    );
  }

  /** Scryfall couldn't be reached at all: a timeout or a network failure. */
  static unreachable(cause: unknown): ScryfallUnavailableError {
    return new ScryfallUnavailableError(undefined, { cause });
  }

  /** Scryfall didn't answer within the deadline named `deadlineName`. */
  static tooSlow(
    deadlineName: string,
    cause: unknown,
  ): ScryfallUnavailableError {
    return new ScryfallUnavailableError(undefined, {
      message: `Scryfall didn’t answer within the ${deadlineName} deadline.`,
      cause,
    });
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
   * reached, even after retrying. Once `signal` is aborted, sends no more
   * searches after the one under way, and throws its reason.
   */
  abstract printingsOn(
    game: string,
    oracleIds: string[],
    signal?: AbortSignal,
  ): Promise<ScryfallCard[]>;

  /**
   * Every Scryfall set. Throws ScryfallUnavailableError if Scryfall itself is
   * in trouble or can't be reached, even after retrying.
   */
  abstract sets(): Promise<ScryfallSet[]>;
}

@Injectable()
export class FetchScryfallClient extends ScryfallClient {
  /** When the next search may start (ms since epoch). */
  private nextStart = 0;
  /** When the last 429's lockout is over (ms since epoch). */
  private lockedUntil = 0;

  async search(query: string, page = 1): Promise<ScryfallSearchPage | null> {
    const url = new URL(`${API}/cards/search`);
    url.searchParams.set('q', query);
    if (page > 1) url.searchParams.set('page', String(page));
    return this.withRetries(url.toString(), (res) => this.parse(res));
  }

  async sets(): Promise<ScryfallSet[]> {
    return this.withRetries(`${API}/sets`, async (res) => {
      if (!res.ok) throw new ScryfallUnavailableError(res.status);
      const body = (await res.json()) as {
        data: {
          code: string;
          name: string;
          set_type: string;
          parent_set_code?: string;
          released_at?: string;
        }[];
      };
      return body.data.map((set) => ({
        code: set.code,
        name: set.name,
        setType: set.set_type,
        parentSetCode: set.parent_set_code ?? null,
        // Only a few unannounced sets lack one; they sort as the newest.
        releasedAt: set.released_at ?? '9999-12-31',
      }));
    });
  }

  /** Requests `url` and reads its answer, retrying when that might help. */
  private async withRetries<T>(
    url: string,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    for (let failures = 0; ; failures++) {
      try {
        return await this.attempt(url, read);
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
    signal?: AbortSignal,
  ): Promise<ScryfallCard[]> {
    const cards: ScryfallCard[] = [];
    for (const query of oracleIdQueries(game, [...new Set(oracleIds)])) {
      for (let page = 1; ; page++) {
        signal?.throwIfAborted();
        const result = await this.search(query, page);
        if (!result) break;
        cards.push(...result.cards);
        if (!result.hasMore) break;
      }
    }
    return cards;
  }

  /** Sends the request and reads its answer, once. */
  private async attempt<T>(
    url: string,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    try {
      return await read(await this.send(url));
    } catch (err) {
      if (err instanceof UnreachableError) {
        throw ScryfallUnavailableError.unreachable(err);
      }
      throw err;
    }
  }

  /** Sends a request in its slot, waiting out rate limiting. */
  private async send(url: string): Promise<Response> {
    for (let rateLimited = 0; ; rateLimited++) {
      await this.waitForSlot();
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

  /**
   * Reserves the next free slot synchronously, so concurrent requests queue
   * up. A request whose slot a lockout begun while it slept has overtaken
   * books a new slot after the lockout, so none is sent until it is over.
   */
  private async waitForSlot(): Promise<void> {
    for (;;) {
      const start = Math.max(Date.now(), this.nextStart);
      this.nextStart = start + REQUEST_INTERVAL_MS;
      await sleepUntil(start);
      if (start >= this.lockedUntil) return;
    }
  }

  /**
   * Holds every request, not just this one, until the lockout is over:
   * those booking a slot from now on, and those already waiting for theirs.
   */
  private backOff(): void {
    this.lockedUntil = Math.max(
      this.lockedUntil,
      Date.now() + RATE_LIMITED_WAIT_MS,
    );
    this.nextStart = Math.max(this.nextStart, this.lockedUntil);
  }
}

/**
 * Resolves once the clock has reached `time` (ms since epoch), at once if it
 * already has. Sleeps again if a timer fires early, so a slot is never left
 * before it starts.
 */
async function sleepUntil(time: number): Promise<void> {
  while (Date.now() < time) {
    await new Promise((resolve) => setTimeout(resolve, time - Date.now()));
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
