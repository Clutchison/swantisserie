import { HttpErrorResponse } from '@angular/common/http';
import type {
  DraftCreationProblem,
  DraftRefusal,
  DraftState,
  DraftView,
  PlanView,
  QueueView,
  TurnState,
} from 'contract';

/**
 * The media query of the draft page's desktop layout, where the tabs sit at
 * the top: the breakpoint in `draft-page.scss` and `lobby-controls.scss`.
 */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** An active draft is any draft that is neither closed nor complete. */
export function isActive(state: DraftState): boolean {
  return state !== 'Complete' && state !== 'Closed';
}

/** Whether it is someone's turn in the draft: whether it is Drafting or Paused. */
export function hasTurn(draft: DraftView): draft is Extract<DraftView, { state: TurnState }> {
  return draft.state === 'Drafting' || draft.state === 'Paused';
}

/**
 * A 409 from the drafts API; its body, if any, says why. Its `error` is any
 * DraftRefusal code but `not-in-pool`, which comes as a 404.
 */
export type RefusalResponse = HttpErrorResponse & { error: DraftRefusal | null };

/**
 * Whether the API refused a request because the draft has moved on: whether
 * it answered 409, whatever the code. Any other failure, `not-in-pool`'s
 * 404 included, is not a refusal and shows as a generic failure.
 */
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

/** A plan with nothing on either plan board, and nothing lost from it. */
export const EMPTY_PLAN: PlanView = { mainboard: [], sideboard: [], basics: [], lost: [] };
