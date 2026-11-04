import { hangOnce } from '../testing/hanging-fetch.js';
import {
  FetchScryfallClient,
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
} from './scryfall-client.js';

describe('FetchScryfallClient', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  let scryfall: FetchScryfallClient;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetch);
    scryfall = new FetchScryfallClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, body: unknown) {
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  const balefire = { object: 'card', name: 'Balefire Dragon' };

  it('searches with a real User-Agent and an Accept header', async () => {
    respond(200, {
      object: 'list',
      total_cards: 1,
      has_more: false,
      data: [balefire],
    });

    await scryfall.search('t:dragon c:r');

    const [url, init] = fetch.mock.calls[0];
    const sent = new URL(url as string);
    expect(sent.origin + sent.pathname).toBe(
      'https://api.scryfall.com/cards/search',
    );
    expect(sent.searchParams.get('q')).toBe('t:dragon c:r');
    const headers = new Headers(init?.headers);
    expect(headers.get('User-Agent')).toMatch(/^Swantisserie\/\S+ \(.+\)$/);
    expect(headers.get('Accept')).toBe('application/json;q=0.9,*/*;q=0.8');
  });

  it('returns the matching cards, their total and any ignored terms', async () => {
    respond(200, {
      object: 'list',
      total_cards: 7156,
      has_more: true,
      warnings: [
        'Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.',
      ],
      data: [balefire],
    });

    expect(await scryfall.search('c:r foo:bar')).toEqual({
      totalCards: 7156,
      hasMore: true,
      cards: [balefire],
      warnings: [
        'Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.',
      ],
    });
  });

  it('asks for a later page by number, leaving the first page’s URL alone', async () => {
    respond(200, {
      object: 'list',
      total_cards: 7156,
      has_more: false,
      data: [balefire],
    });

    const page = await scryfall.search('c:r', 41);

    const sent = new URL(fetch.mock.calls[0][0] as string);
    expect(sent.searchParams.get('q')).toBe('c:r');
    expect(sent.searchParams.get('page')).toBe('41');
    expect(page).toMatchObject({ hasMore: false });
  });

  it('backs off for 30 seconds after a 429, then tries again', async () => {
    vi.useFakeTimers();
    try {
      respond(429, {
        object: 'error',
        status: 429,
        details: 'Too many requests',
      });
      respond(200, {
        object: 'list',
        total_cards: 1,
        has_more: false,
        data: [balefire],
      });

      const search = scryfall.search('c:r');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(await search).toMatchObject({ cards: [balefire] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after repeated 429s rather than hammering Scryfall', async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 4; i++) {
        respond(429, { object: 'error', status: 429, details: 'Too many' });
      }

      const search = scryfall.search('c:r');
      const outcome = search.then(
        () => 'resolved',
        (err: Error) => err.message,
      );
      await vi.advanceTimersByTimeAsync(4 * 30_000);

      expect(fetch).toHaveBeenCalledTimes(4);
      expect(await outcome).toBe('Scryfall request failed: 429');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when nothing matches', async () => {
    respond(404, {
      object: 'error',
      code: 'not_found',
      status: 404,
      details: 'Your query didn’t match any cards.',
    });

    expect(await scryfall.search('name:zzzzqqqq')).toBeNull();
  });

  it('throws Scryfall’s explanation when it rejects the query', async () => {
    respond(400, {
      object: 'error',
      code: 'bad_request',
      status: 400,
      warnings: [
        'Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.',
      ],
      details: 'All of your terms were ignored.',
    });

    const error = await scryfall.search('foo:bar').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ScryfallRejectedSearchError);
    expect(error).toMatchObject({
      details: 'All of your terms were ignored.',
      warnings: [
        'Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.',
      ],
    });
  });

  it('copes with a rejection whose warnings are null', async () => {
    respond(400, {
      object: 'error',
      code: 'bad_request',
      status: 400,
      warnings: null,
      details: 'Your search contains unclosed parentheses.',
    });

    await expect(scryfall.search('c:r (((')).rejects.toMatchObject({
      details: 'Your search contains unclosed parentheses.',
      warnings: [],
    });
  });

  it('keeps searches at least 600 ms apart, inside Scryfall’s limit of 2 per second', async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 3; i++) {
        respond(404, { object: 'error', status: 404, details: 'No cards' });
      }

      const searches = Promise.all([
        scryfall.search('a'),
        scryfall.search('b'),
        scryfall.search('c'),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(599);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(600);
      expect(fetch).toHaveBeenCalledTimes(3);
      await searches;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not make a search wait when the last one was long enough ago', async () => {
    vi.useFakeTimers();
    try {
      respond(404, { object: 'error', status: 404, details: 'No cards' });
      respond(404, { object: 'error', status: 404, details: 'No cards' });

      await scryfall.search('a');
      await vi.advanceTimersByTimeAsync(700);
      const second = scryfall.search('b');
      await vi.advanceTimersByTimeAsync(0);

      expect(fetch).toHaveBeenCalledTimes(2);
      await second;
    } finally {
      vi.useRealTimers();
    }
  });

  describe('printingsOn', () => {
    /** A Scryfall search answer holding these cards, with more pages if `hasMore`. */
    const found = (cards: object[], hasMore = false) => ({
      object: 'list',
      total_cards: cards.length,
      has_more: hasMore,
      data: cards,
    });
    const sentQueries = () =>
      fetch.mock.calls.map(([url]) => ({
        q: new URL(url as string).searchParams.get('q')!,
        page: new URL(url as string).searchParams.get('page'),
      }));
    /** An oracle id as long as a real one (a UUID). */
    const oracleId = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

    it('searches the game for one printing of each card by oracle id', async () => {
      const bolt = { name: 'Lightning Bolt', oracle_id: 'bolt' };
      respond(200, found([bolt]));

      const cards = await scryfall.printingsOn('arena', ['bolt', 'shock']);

      expect(sentQueries()).toEqual([
        {
          q: '(oracleid:bolt or oracleid:shock) game:arena unique:cards',
          page: null,
        },
      ]);
      expect(cards).toEqual([bolt]);
    });

    it('splits a long list across searches Scryfall accepts, asking for each card once', async () => {
      vi.useFakeTimers();
      try {
        const ids = Array.from({ length: 50 }, (_, n) => oracleId(n));
        fetch.mockImplementation(async () => Response.json(found([])));

        const cards = scryfall.printingsOn('mtgo', [...ids, ...ids]);
        await vi.advanceTimersByTimeAsync(10_000);
        await cards;

        const queries = sentQueries().map(({ q }) => q);
        expect(queries.length).toBeGreaterThan(1);
        for (const q of queries) {
          expect(q.length).toBeLessThanOrEqual(1000);
          expect(q).toMatch(/^\(oracleid:.+\) game:mtgo unique:cards$/);
        }
        const asked = queries.flatMap((q) =>
          [...q.matchAll(/oracleid:([\w-]+)/g)].map(([, id]) => id),
        );
        expect(asked).toEqual(ids);
      } finally {
        vi.useRealTimers();
      }
    });

    it('follows a search onto its later pages', async () => {
      vi.useFakeTimers();
      try {
        const bolt = { name: 'Lightning Bolt', oracle_id: 'bolt' };
        const shock = { name: 'Shock', oracle_id: 'shock' };
        respond(200, found([bolt], true));
        respond(200, found([shock]));

        const cards = scryfall.printingsOn('arena', ['bolt', 'shock']);
        await vi.advanceTimersByTimeAsync(600);

        expect(sentQueries().map(({ page }) => page)).toEqual([null, '2']);
        expect(await cards).toEqual([bolt, shock]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns no cards when none of them is on the game', async () => {
      respond(404, { object: 'error', status: 404, details: 'No cards' });

      expect(await scryfall.printingsOn('arena', ['bolt'])).toEqual([]);
    });

    it('asks nothing for no cards', async () => {
      expect(await scryfall.printingsOn('arena', [])).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('when Scryfall itself is in trouble', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const down = () =>
      respond(503, {
        object: 'error',
        status: 503,
        details: 'Down for maintenance',
      });
    const someCards = () =>
      respond(200, {
        object: 'list',
        total_cards: 1,
        has_more: false,
        data: [balefire],
      });
    /** The search's error, once every retry has had its time. */
    async function failure(search: Promise<unknown>) {
      const outcome = search.catch((err: unknown) => err);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      return outcome;
    }

    it('fails plainly once retrying hasn’t helped', async () => {
      for (let i = 0; i < 4; i++) down();

      const error = await failure(scryfall.search('c:r'));

      expect(error).toBeInstanceOf(ScryfallUnavailableError);
      expect(error).toMatchObject({ status: 503 });
    });

    it('tries again after a server error', async () => {
      down();
      someCards();

      const search = scryfall.search('c:r');
      await vi.advanceTimersByTimeAsync(1000);

      expect(await search).toMatchObject({ cards: [balefire] });
    });

    it('waits 1, 2 and then 4 seconds between its 4 tries', async () => {
      for (let i = 0; i < 4; i++) down();

      const outcome = scryfall.search('c:r').catch((err: unknown) => err);
      for (const [wait, tries] of [
        [0, 1],
        [999, 1],
        [1, 2],
        [1999, 2],
        [1, 3],
        [3999, 3],
        [1, 4],
      ]) {
        await vi.advanceTimersByTimeAsync(wait);
        expect(fetch).toHaveBeenCalledTimes(tries);
      }

      expect(await outcome).toBeInstanceOf(ScryfallUnavailableError);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('fails plainly when Scryfall can’t be reached', async () => {
      fetch.mockRejectedValue(new TypeError('fetch failed'));

      const error = await failure(scryfall.search('c:r'));

      expect(error).toBeInstanceOf(ScryfallUnavailableError);
      expect(error).toMatchObject({ status: undefined });
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('gives up on a request after 10 seconds, and fails plainly once retrying hasn’t helped', async () => {
      for (let i = 0; i < 4; i++) hangOnce(fetch);

      const outcome = scryfall.search('c:r').catch((err: unknown) => err);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).toHaveBeenCalledTimes(2);

      expect(await failure(outcome)).toBeInstanceOf(ScryfallUnavailableError);
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it.each([
      [400, { object: 'error', status: 400, details: 'Bad query' }],
      [404, { object: 'error', status: 404, details: 'No cards' }],
    ])('never retries a %i, which is about the query', async (status, body) => {
      respond(status, body);

      await failure(scryfall.search('c:r'));

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
