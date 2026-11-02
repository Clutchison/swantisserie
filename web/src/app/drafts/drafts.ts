import { HttpErrorResponse } from '@angular/common/http';
import type { DraftState, QueueView } from 'contract';

/** An active draft is any draft that is neither closed nor complete. */
export function isActive(state: DraftState): boolean {
  return state !== 'Complete' && state !== 'Closed';
}

/** Whether the API refused a request because the draft has moved on; its body says why. */
export function isRefusal(err: unknown): err is HttpErrorResponse {
  return err instanceof HttpErrorResponse && err.status === 409;
}

/** The body of a failed POST /api/drafts: what to tell the organizer. */
export type DraftProblem =
  | { error: 'not-on-platform'; message: string; cards: string[]; totalCards: number }
  | { error: 'query-rejected'; message: string; warnings: string[] }
  | { error: 'no-cards' | 'invalid' | 'scryfall-unavailable'; message: string }
  /** Set by the web app when the API gave no explanation, e.g. offline. */
  | { error: 'request-failed'; message: string };

/** A queue with no cards in it, and none lost or cleared. */
export const EMPTY_QUEUE: QueueView = { cards: [], lost: [], cleared: [] };
