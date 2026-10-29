import {
  FetchScryfallClient,
  ScryfallRejectedSearchError,
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
      cards: [balefire],
      warnings: [
        'Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.',
      ],
    });
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

  it('keeps searches at least 500 ms apart, Scryfall’s limit of 2 per second', async () => {
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

      await vi.advanceTimersByTimeAsync(499);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(500);
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
      await vi.advanceTimersByTimeAsync(600);
      const second = scryfall.search('b');
      await vi.advanceTimersByTimeAsync(0);

      expect(fetch).toHaveBeenCalledTimes(2);
      await second;
    } finally {
      vi.useRealTimers();
    }
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
