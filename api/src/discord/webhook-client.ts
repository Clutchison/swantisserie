import { Injectable } from '@nestjs/common';
import type { WebhookMessage } from './draft-messages.js';

/** Thrown when Discord no longer has the webhook: posting again won't help. */
export class WebhookGoneError extends Error {
  constructor() {
    super('Discord no longer has this webhook.');
  }
}

/**
 * Thrown when Discord refuses a post, other than for a missing webhook or a
 * rate limit: posting it again won't help.
 */
export class WebhookRefusedError extends Error {
  constructor(readonly status: number) {
    super(`Discord refused the webhook post: ${status}`);
  }
}

/** Posting to Discord webhooks: the boundary faked in tests. */
export abstract class WebhookClient {
  /**
   * Posts `message` to the webhook at `url`. Throws WebhookGoneError if
   * Discord no longer has it, WebhookRefusedError if Discord refuses the post
   * for good, and another error on a failure worth retrying: a rate limit, a
   * server error or a network error.
   */
  abstract post(url: string, message: WebhookMessage): Promise<void>;
}

@Injectable()
export class FetchWebhookClient extends WebhookClient {
  async post(url: string, message: WebhookMessage): Promise<void> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (res.status === 404) throw new WebhookGoneError();
    // Never the URL in an error: it is a secret, and errors get logged.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new WebhookRefusedError(res.status);
    }
    if (!res.ok) throw new Error(`Discord webhook post failed: ${res.status}`);
  }
}
