import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, signal, type Signal } from '@angular/core';
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
import type { Changes } from './changes';

/**
 * The media query of the draft page's desktop layout, where the tabs sit at
 * the top: `$desktop` in `src/_breakpoints.scss`, which the draft page's
 * stylesheets use. Change them together.
 */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * The media query of the draft page's wide desktop layout, where the Players
 * panel is a pane beside the tabs with its seat order always open:
 * `$wide-desktop` in `src/_breakpoints.scss`. Change them together.
 */
export const WIDE_DESKTOP_QUERY = '(min-width: 1200px)';

/**
 * The media query of a screen whose primary pointer is touch, where a queue
 * row is dragged by its handle, and moved or removed from its row menu.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * How long, in ms, a card is held before a drag of it starts, as the CDK's
 * `cdkDragStartDelay` takes it: on touch, long enough that a swipe scrolls.
 */
export const DRAG_START_DELAY = { touch: 200, mouse: 0 };

/** Picks left at or below this highlight the count, so a viewer near the end of their picks notices. */
export const HIGHLIGHT_PICKS_LEFT_AT = 10;

/**
 * The width in px of the Deck tab's stacks area from which it has room for
 * the wide stacks layout, with the sideboard's stack beside the mainboard's;
 * narrower, the mainboard's stacks become a strip that scrolls sideways. The
 * container query in `plan-stacks-layout.scss` breaks at it too:
 * `$wide-stacks-container` in `src/_breakpoints.scss`. Change them together.
 */
export const WIDE_STACKS_WIDTH = 760;

/**
 * Whether the media query `query` matches, as the window is resized. No
 * `matchMedia` counts as no match. Call it in an injection context: it stops
 * listening as that is destroyed.
 */
export function matching(query: string): Signal<boolean> {
  const media = globalThis.matchMedia?.(query);
  const matches = signal(!!media?.matches);
  // Not every test environment's `matchMedia` reports changes.
  if (!media?.addEventListener) return matches.asReadonly();
  const listening = new AbortController();
  // Stryker disable next-line ObjectLiteral: a listener left running after teardown only sets a destroyed component's signal.
  media.addEventListener('change', (event) => matches.set(event.matches), {
    signal: listening.signal,
  });
  // Stryker disable next-line ArrowFunction,CallExpression: a listener left running after teardown only sets a destroyed component's signal.
  inject(DestroyRef).onDestroy(() => listening.abort());
  return matches.asReadonly();
}

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
  return setsText(
    setList.map(({ code, sublists }) => ({
      name: code.toUpperCase(),
      sublists: sublists.map((sublist) => sublist.toUpperCase()),
    })),
  );
}

/**
 * Sets as a viewer reads them, each with the sublists it includes beside
 * it, e.g. `MKM, OTJ (+ BIG, OTP)`, or the same by the sets' names.
 */
export function setsText(sets: { name: string; sublists: string[] }[]): string {
  return sets
    .map(({ name, sublists }) =>
      sublists.length === 0 ? name : `${name} (+ ${sublists.join(', ')})`,
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

/** What a failed change to the players or seats says when the api gives no reason. */
export const PLAYERS_CHANGE_FAILED = "Couldn't update the players. Try again in a moment.";

/** What sends a change to the draft; undefined when the viewer thought better of it. */
type Sending = (() => Promise<unknown>) | undefined;

/**
 * Sends one change to the draft through `changes`, which keeps focus and
 * sends one change at a time, and answers whether it was made. `go` asks
 * the viewer whatever it must, then answers what sends the change, or
 * nothing if they thought better of it. Before it is sent, `started` runs;
 * if it fails, `failed` hears why: the api's reason if it refused, else
 * `failure`. `options` are `Changes.send`'s.
 */
export function sendDraftChange(
  changes: Changes,
  go: () => Sending | Promise<Sending>,
  {
    failure,
    started,
    failed,
    ...options
  }: {
    failure: string;
    started: () => void;
    failed: (message: string) => void;
    keep?: string[];
    status?: string;
    busyOnceMade?: boolean;
  },
): Promise<boolean> {
  return changes.send(async () => {
    // Not awaited when `go` asks nothing, so the change is sent at once, as pressed.
    const made = go();
    const sending = made instanceof Promise ? await made : made;
    if (!sending) return;
    started();
    try {
      await sending();
      return true;
    } catch (err) {
      failed(changeFailure(err, failure));
      return false;
    }
  }, options);
}

/** What a failed change to the plan says when the api gives no reason. */
export const PLAN_CHANGE_FAILED = "Couldn't change your deck. Try again in a moment.";

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
