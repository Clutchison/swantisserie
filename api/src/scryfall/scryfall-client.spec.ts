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

  describe('printings', () => {
    it('posts the print ids and returns the cards found', async () => {
      respond(200, {
        object: 'list',
        not_found: [{ id: 'gone-id' }],
        data: [balefire],
      });

      const cards = await scryfall.printings(['balefire-id', 'gone-id']);

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.scryfall.com/cards/collection');
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('User-Agent')).toMatch(/^Swantisserie\/\S+ \(.+\)$/);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(JSON.parse(init?.body as string)).toEqual({
        identifiers: [{ id: 'balefire-id' }, { id: 'gone-id' }],
      });
      expect(cards).toEqual([balefire]);
    });

    it('shares the 600 ms spacing with searches', async () => {
      vi.useFakeTimers();
      try {
        respond(404, { object: 'error', status: 404, details: 'No cards' });
        respond(200, { object: 'list', not_found: [], data: [] });

        const both = Promise.all([
          scryfall.search('a'),
          scryfall.printings(['balefire-id']),
        ]);
        await vi.advanceTimersByTimeAsync(599);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        await both;
      } finally {
        vi.useRealTimers();
      }
    });

    it('backs off after a 429, then tries again', async () => {
      vi.useFakeTimers();
      try {
        respond(429, { object: 'error', status: 429, details: 'Too many' });
        respond(200, { object: 'list', not_found: [], data: [balefire] });

        const cards = scryfall.printings(['balefire-id']);
        await vi.advanceTimersByTimeAsync(30_000);

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(await cards).toEqual([balefire]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('fails plainly when Scryfall refuses the lookup', async () => {
      respond(400, { object: 'error', status: 400, details: 'Too many' });

      await expect(scryfall.printings(['balefire-id'])).rejects.toBeInstanceOf(
        ScryfallUnavailableError,
      );
    });
  });

  it('fails plainly when Scryfall itself is in trouble', async () => {
    respond(503, {
      object: 'error',
      status: 503,
      details: 'Down for maintenance',
    });

    const error = await scryfall.search('c:r').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ScryfallRejectedSearchError);
  });
});
