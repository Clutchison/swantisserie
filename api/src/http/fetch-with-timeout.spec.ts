import { fetchWithTimeout, UnreachableError } from './fetch-with-timeout.js';

describe('fetchWithTimeout', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A fetch that never answers, until its signal aborts it. */
  function hang() {
    fetch.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal!.reason),
          );
        }),
    );
  }

  it('sends the request and passes the response through', async () => {
    fetch.mockResolvedValueOnce(Response.json({ ok: true }, { status: 201 }));

    const res = await fetchWithTimeout(
      'https://example.com/thing',
      { method: 'POST', headers: { 'X-Test': 'yes' } },
      1000,
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.com/thing');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('X-Test')).toBe('yes');
  });

  it('passes through a response with no body', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await fetchWithTimeout('https://example.com', {}, 1000);

    expect(res.status).toBe(204);
  });

  it('turns a failed fetch into UnreachableError, keeping the cause', async () => {
    const failure = new TypeError('fetch failed');
    fetch.mockRejectedValueOnce(failure);

    const error = await fetchWithTimeout('https://example.com', {}, 1000).catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(UnreachableError);
    expect(error).toMatchObject({ cause: failure });
  });

  it('gives up with UnreachableError once the timeout passes', async () => {
    hang();

    const outcome = fetchWithTimeout('https://example.com', {}, 1000).catch(
      (err: unknown) => err,
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await outcome;
    expect(error).toBeInstanceOf(UnreachableError);
    expect((error as Error).cause).toBeDefined();
  });

  it('cuts off a body read still going when the timeout passes', async () => {
    fetch.mockImplementationOnce(async (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"cards": ['));
          init?.signal?.addEventListener('abort', () =>
            controller.error(init.signal!.reason),
          );
        },
      });
      return new Response(body, { status: 200 });
    });

    const res = await fetchWithTimeout('https://example.com', {}, 1000);
    const read = res.json().catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await read).toBeInstanceOf(UnreachableError);
  });

  it('never names the URL, which may be a secret', async () => {
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const error = await fetchWithTimeout(
      'https://discord.com/api/webhooks/1/secret-token',
      {},
      1000,
    ).catch((err: unknown) => err);

    expect(String(error)).not.toContain('secret-token');
  });
});
