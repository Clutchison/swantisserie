import { Injectable } from '@nestjs/common';
import type { WebhookMessage } from './draft-messages.js';

/** Thrown when Discord no longer has the webhook: posting again won't help. */
export class WebhookGoneError extends Error {
  constructor() {
    super('Discord no longer has this webhook.');
  }
}

/** Posting to Discord webhooks: the boundary faked in tests. */
export abstract class WebhookClient {
  /**
   * Posts `message` to the webhook at `url`. Throws WebhookGoneError if
   * Discord no longer has it, and another error on any other failure.
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
    // Never the URL in the error: it is a secret, and errors get logged.
    if (!res.ok) throw new Error(`Discord webhook post failed: ${res.status}`);
  }
}
