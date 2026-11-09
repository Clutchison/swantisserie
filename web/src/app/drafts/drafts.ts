import { HttpErrorResponse } from '@angular/common/http';
import type {
  DraftCreationProblem,
  DraftPowersView,
  DraftRefusal,
  DraftState,
  DraftView,
  PlanView,
  QueueView,
  SetListEntryView,
  TurnState,
} from 'contract';

/**
 * The media query of the draft page's desktop layout, where the tabs sit at
 * the top: the breakpoint in `draft-page.scss` and `lobby-controls.scss`.
 */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * The media query of the screens whose Plan tab has room for the wide stacks
 * layout, with the sideboard's stack beside the mainboard's; narrower, the
 * mainboard's stacks become a strip that scrolls sideways. Kept in step with
 * the container query in `plan-tab.scss`, 760px of stacks area, plus the
 * draft page's padding either side.
 */
export const WIDE_STACKS_QUERY = '(min-width: 792px)';

/** The draft powers of a viewer who may do nothing to a draft beyond playing in it. */
export const NO_POWERS: DraftPowersView = {
  organize: false,
  addBots: false,
  switchAnnouncements: false,
};

/**
 * A set list as a viewer reads it: each set by its code, with the sublists
 * it includes beside it, e.g. `MKM, OTJ (+ BIG, OTP)`.
 */
export function setListText(setList: SetListEntryView[]): string {
  return setList
    .map(({ code, sublists }) =>
      sublists.length === 0
        ? code.toUpperCase()
        : `${code.toUpperCase()} (+ ${sublists.map((s) => s.toUpperCase()).join(', ')})`,
    )
    .join(', ');
}

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
  // Stryker disable next-line OptionalChaining: the api's 409 always carries a refusal body.
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

/** A plan with nothing on either plan board, nothing lost from it, and no preferred printings. */
export const EMPTY_PLAN: PlanView = {
  mainboard: [],
  sideboard: [],
  basics: [],
  lost: [],
  readyNotice: false,
  preferredPrintings: {},
};
