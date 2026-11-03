import { HttpErrorResponse } from '@angular/common/http';
import type { DraftCreationProblem, DraftRefusal, DraftState, PlanView, QueueView } from 'contract';

/** An active draft is any draft that is neither closed nor complete. */
export function isActive(state: DraftState): boolean {
  return state !== 'Complete' && state !== 'Closed';
}

/** A 409 from the drafts API; its body, if any, says why. */
export type RefusalResponse = HttpErrorResponse & { error: DraftRefusal | null };

/** Whether the API refused a request because the draft has moved on; its body says why. */
export function isRefusal(err: unknown): err is RefusalResponse {
  return err instanceof HttpErrorResponse && err.status === 409;
}

/**
 * Why a change failed: the API's reason when it refused the change because
 * the draft, queue or plan has moved on, e.g. a card was lost; else `fallback`.
 */
export function changeFailure(err: unknown, fallback: string): string {
  return (isRefusal(err) && err.error?.message) || fallback;
}

/** Why creating a draft failed, from the API or the request itself: what to tell the organizer. */
export type DraftProblem =
  | DraftCreationProblem
  /** Set by the web app when the API gave no explanation, e.g. offline. */
  | { error: 'request-failed'; message: string };

/** A queue with no cards in it, and none lost or cleared. */
export const EMPTY_QUEUE: QueueView = {
  cards: [],
  lost: [],
  cleared: [],
  restKept: false,
  stealBehavior: 'ClearQueue',
};

/** A plan with nothing on either board, and nothing taken out of it. */
export const EMPTY_PLAN: PlanView = { mainboard: [], sideboard: [], removed: [] };
