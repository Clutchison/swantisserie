import { Injectable } from '@nestjs/common';
import { cancelBody, fetchWithTimeout } from '../http/fetch-with-timeout.js';
import type { WebhookMessage } from './draft-messages.js';

/** How long a webhook post may take. */
const POST_TIMEOUT_MS = 10_000;

/**
 * Thrown when Discord no longer accepts posts on the webhook: it was deleted
 * (a 404) or its token was reset (a 401). Posting again won't help.
 */
export class WebhookGoneError extends Error {
  constructor(status: number) {
    super(`Discord no longer accepts posts on this webhook: ${status}`);
  }
}

/**
 * Thrown when Discord refuses a post, other than for a gone webhook or a
 * rate limit: posting it again won't help.
 */
export class WebhookRefusedError extends Error {
  constructor(readonly status: number) {
    super(`Discord refused the webhook post: ${status}`);
  }
}

/**
 * Thrown when Discord rate limits a post (a 429) and says how long to wait,
 * in its body's `retry_after` or else its `Retry-After` header. Posting again
 * before `retryAfterMs` has passed would be rate limited too.
 */
export class WebhookRateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(
      `Discord webhook post failed: 429, rate limited for ${retryAfterMs} ms`,
    );
  }
}

/** Posting to Discord webhooks: the boundary faked in tests. */
export abstract class WebhookClient {
  /**
   * Posts `message` to the webhook at `url`. Throws WebhookGoneError if
   * the webhook is gone, WebhookRefusedError if Discord refuses the post
   * for good, WebhookRateLimitedError if Discord rate limits it and says how
   * long to wait, and another error on a failure worth retrying: a rate limit
   * that doesn't say how long, a server error, a network error or a timeout.
   */
  abstract post(url: string, message: WebhookMessage): Promise<void>;
}

@Injectable()
export class FetchWebhookClient extends WebhookClient {
  async post(url: string, message: WebhookMessage): Promise<void> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        },
        POST_TIMEOUT_MS,
      );
    } catch {
      // Not the cause: it may name the URL, which is a secret.
      throw new Error(
        'Discord webhook post failed: Discord could not be reached.',
      );
    }
    // Only a 429's body is read, for how long to wait; any other is cancelled.
    let waitMs: number | undefined;
    if (res.status === 429) waitMs = await retryAfterMs(res);
    else await cancelBody(res);
    const error = webhookPostError(res.status, waitMs);
    if (error) throw error;
  }
}

/**
 * How long a 429 says to wait, in ms: its body's `retry_after`, else its
 * `Retry-After` header, both in seconds. Undefined if it says neither.
 */
async function retryAfterMs(res: Response): Promise<number | undefined> {
  const seconds =
    secondsIn(await bodyRetryAfter(res)) ??
    secondsIn(res.headers.get('Retry-After'));
  return seconds === undefined ? undefined : Math.ceil(seconds * 1000);
}

/** The `retry_after` of a 429's JSON body, if it can be read. */
async function bodyRetryAfter(res: Response): Promise<unknown> {
  try {
    const body: unknown = await res.json();
    return typeof body === 'object' && body !== null && 'retry_after' in body
      ? body.retry_after
      : undefined;
  } catch {
    // Unreadable or not JSON: the header may still say.
    return undefined;
  }
}

/** `value` as a number of seconds to wait, if it is one. */
function secondsIn(value: unknown): number | undefined {
  const seconds =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * What a webhook post answered with `status` failed with, as
 * WebhookClient.post throws it, or null if it didn't fail. A 429 is a
 * WebhookRateLimitedError when `retryAfterMs`, how long Discord said to wait,
 * is known.
 */
export function webhookPostError(
  status: number,
  retryAfterMs?: number,
): Error | null {
  if (status >= 200 && status < 300) return null;
  if (status === 404 || status === 401) return new WebhookGoneError(status);
  // Never the URL in an error: it is a secret, and errors get logged.
  if (status >= 400 && status < 500 && status !== 429) {
    return new WebhookRefusedError(status);
  }
  if (status === 429 && retryAfterMs !== undefined) {
    return new WebhookRateLimitedError(retryAfterMs);
  }
  return new Error(`Discord webhook post failed: ${status}`);
}
