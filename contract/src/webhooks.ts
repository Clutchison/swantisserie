import type { WebhookView } from './drafts.js';

/** A webhook as app admins see it, URL and all. */
export interface WebhookWithUrlView extends WebhookView {
  /** A secret: only app admins are sent it. */
  url: string;
}

/**
 * Why an app admin's change to the webhook registry was refused; sent to
 * them as is. invalid: a 400 naming the field to fix. name-taken: a 409.
 */
export interface WebhookRegistryProblem {
  error: 'invalid' | 'name-taken';
  message: string;
}

/** The most characters in a webhook's name. */
export const MAX_WEBHOOK_NAME_LENGTH = 100;

/** A webhook an app admin registers. */
export interface NewWebhookRequest {
  name: string;
  /** Discord's URL for the webhook. */
  url: string;
}

/** A webhook's new name. */
export interface WebhookRenameRequest {
  name: string;
}
