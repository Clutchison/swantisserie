import { respondWithCancelProbe } from '../testing/cancel-probe.js';
import { hangOnce } from '../testing/hanging-fetch.js';
import { inspect } from 'node:util';
import type { WebhookMessage } from './draft-messages.js';
import {
  FetchWebhookClient,
  WebhookGoneError,
  webhookPostError,
  WebhookRateLimitedError,
  WebhookRefusedError,
} from './webhook-client.js';

describe('webhookPostError', () => {
  it('is nothing for a post Discord took', () => {
    expect(webhookPostError(204)).toBeNull();
  });

  it.each([404, 401])(
    'says Discord no longer accepts posts on the webhook on a %i',
    (status) => {
      expect(webhookPostError(status)).toBeInstanceOf(WebhookGoneError);
    },
  );

  it.each([400, 403, 413])(
    'says Discord refused the post on a %i',
    (status) => {
      const error = webhookPostError(status);
      expect(error).toBeInstanceOf(WebhookRefusedError);
      expect(String(error)).toContain(String(status));
    },
  );

  it('says how long to wait on a 429 that says so', () => {
    const error = webhookPostError(429, 1_500);
    expect(error).toBeInstanceOf(WebhookRateLimitedError);
    expect(error).toMatchObject({ retryAfterMs: 1_500 });
  });

  it.each([429, 500, 502, 503])(
    'is a failure worth retrying on a %i',
    (status) => {
      const error = webhookPostError(status);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(WebhookGoneError);
      expect(error).not.toBeInstanceOf(WebhookRefusedError);
      expect(String(error)).toContain(String(status));
    },
  );
});

describe('FetchWebhookClient', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  let webhooks: FetchWebhookClient;

  const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/secret-token';
  const message: WebhookMessage = {
    content: 'Pick 3 is yours, <@42>.',
    allowed_mentions: { parse: [], users: ['42'] },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetch);
    webhooks = new FetchWebhookClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function respond(status: number) {
    fetch.mockResolvedValueOnce(
      new Response(status === 204 ? null : '{}', { status }),
    );
  }

  /** What posting the message failed with, once any timeout has passed. */
  async function failure() {
    vi.useFakeTimers();
    const outcome = webhooks.post(WEBHOOK_URL, message).then(
      () => {
        throw new Error('The post succeeded.');
      },
      (err: unknown) => err,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    return outcome;
  }

  it('posts the message as JSON to the webhook', async () => {
    respond(204);

    await webhooks.post(WEBHOOK_URL, message);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(JSON.parse(init?.body as string)).toEqual(message);
  });

  it('resolves when Discord takes the post', async () => {
    respond(200);

    await expect(webhooks.post(WEBHOOK_URL, message)).resolves.toBeUndefined();
  });

  it('cancels the body of a post Discord took, which it doesn’t read', async () => {
    const probe = respondWithCancelProbe(fetch, 200);

    await webhooks.post(WEBHOOK_URL, message);
    expect(probe.cancelled).toBe(true);
  });

  it('throws WebhookGoneError when Discord no longer has the webhook', async () => {
    respond(404);

    expect(await failure()).toBeInstanceOf(WebhookGoneError);
  });

  it('throws WebhookRefusedError when Discord refuses the post', async () => {
    respond(400);

    expect(await failure()).toBeInstanceOf(WebhookRefusedError);
  });

  it('cancels the body of a refused post, which it doesn’t read', async () => {
    const probe = respondWithCancelProbe(fetch, 400);

    expect(await failure()).toBeInstanceOf(WebhookRefusedError);
    expect(probe.cancelled).toBe(true);
  });

  it('throws WebhookRateLimitedError with the wait the body’s retry_after gives on a 429', async () => {
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'You are being rate limited.',
          retry_after: 64.57,
          global: false,
        }),
        { status: 429, headers: { 'Retry-After': '65' } },
      ),
    );

    const error = await failure();

    expect(error).toBeInstanceOf(WebhookRateLimitedError);
    expect(error).toMatchObject({ retryAfterMs: 64_570 });
  });

  it('throws WebhookRateLimitedError with the Retry-After header’s wait on a 429 whose body has none', async () => {
    fetch.mockResolvedValueOnce(
      new Response('', { status: 429, headers: { 'Retry-After': '7' } }),
    );

    const error = await failure();

    expect(error).toBeInstanceOf(WebhookRateLimitedError);
    expect(error).toMatchObject({ retryAfterMs: 7_000 });
  });

  it.each<[string, () => void]>([
    ['a rate limit that doesn’t say how long', () => respond(429)],
    ['a server error', () => respond(503)],
    [
      'a network error',
      () => fetch.mockRejectedValueOnce(new TypeError('fetch failed')),
    ],
  ])('throws a failure worth retrying on %s', async (_, fail) => {
    fail();

    const error = await failure();

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WebhookGoneError);
    expect(error).not.toBeInstanceOf(WebhookRefusedError);
  });

  it('gives up after 10 seconds without an answer, with a failure worth retrying', async () => {
    vi.useFakeTimers();
    hangOnce(fetch);

    const outcome = webhooks
      .post(WEBHOOK_URL, message)
      .catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WebhookGoneError);
    expect(error).not.toBeInstanceOf(WebhookRefusedError);
  });

  it.each<[string, () => void]>([
    ['refused', () => respond(400)],
    ['gone', () => respond(404)],
    ['failed', () => respond(500)],
    [
      'unreachable',
      () =>
        fetch.mockRejectedValueOnce(
          new TypeError(`Failed to parse URL from ${WEBHOOK_URL}`),
        ),
    ],
  ])('never puts the webhook’s URL in the error when %s', async (_, fail) => {
    fail();

    const error = await failure();

    // As logged: the message, and every cause along with it.
    expect(inspect(error, { depth: null })).not.toContain('secret-token');
  });
});
