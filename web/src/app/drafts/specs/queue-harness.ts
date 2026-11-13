import { TestBed } from '@angular/core/testing';
import {
  accessibleName,
  buttons,
  byAriaLabel,
  byName,
  menuItem,
  openMenu,
  text,
} from '../../specs-harness';
import type { QueueView } from 'contract';
import { EMPTY_PLAN } from '../drafts';
import {
  type AppFixture,
  type DraftFixture,
  bob,
  cardNames,
  draft,
  drafting,
  flushPicks,
  flushQueueAndPlan,
  namedList,
  updates,
} from './harness';

/**
 * Another player's pick, pick 2 of round 1 by Bob, reaches the page and
 * leaves the signed-in player's queue as `queue`, such as one it paused:
 * the draft, with `fields`, its picks and the queue are re-read.
 */
export async function pickChangesQueue(
  fixture: AppFixture,
  queue: QueueView,
  fields: DraftFixture = {},
) {
  updates.events.next({
    type: 'changed',
    draft: draft(
      drafting({ ...fields, turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 }),
    ),
  });
  await flushPicks([]);
  await flushQueueAndPlan(queue, EMPTY_PLAN);
  await fixture.whenStable();
}

/** The list of the cards in the signed-in player's queue, inside `root`, by its name. */
export const queueList = (root: HTMLElement) => namedList(root, 'Your queue');

/** The queue's rows inside `root`, its list items, in order: each queued card's, and the Queue cutoff's. */
const queueRows = (root: HTMLElement) => [...queueList(root).querySelectorAll<HTMLElement>('li')];
/** What a screen reader hears on each of the queue's rows inside `root`, in order. */
export const queueRowNames = (root: HTMLElement) =>
  queueRows(root).map((row) => accessibleName(row));
/** The rows of the queue inside `root` that a screen reader hears as just added. */
const justAddedRows = (root: HTMLElement) =>
  queueRows(root).filter((row) => accessibleName(row).includes('just added'));
/** The names of the cards in the queue inside `root` marked as just added. */
export const justAddedCards = (root: HTMLElement) =>
  justAddedRows(root).flatMap((row) => cardNames(row).map((name) => text(name)));
/** Plays out the just-added highlight on the queue's rows inside `root`, as a browser ends its animation. */
export const endJustAddedHighlight = (root: HTMLElement) =>
  justAddedRows(root).forEach((row) => row.dispatchEvent(new Event('animationend')));

/**
 * The "next up" strip, below the desktop layout: the button named for the
 * queue that opens the Queue sheet. Undefined if there is none.
 */
export const findNextUpStrip = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')].find((strip) =>
    /^Queue\b/.test(accessibleName(strip)),
  );
/** The "next up" strip, which is there. */
export const nextUpStrip = (page: HTMLElement) => findNextUpStrip(page)!;
/** The Queue sheet: the dialog named "Queue" over the page, holding the Queue pane. Null if it is closed. */
export const queueSheet = () => byAriaLabel(document.body, '[role="dialog"]', 'Queue');
/** Opens the Queue sheet from the "next up" strip, below the desktop layout, and returns it. */
export async function openQueueSheet(fixture: AppFixture, page: HTMLElement) {
  nextUpStrip(page).click();
  await fixture.whenStable();
  return queueSheet()!;
}

/**
 * The Queue pane: the region named "Queue", beside the tabs from the desktop
 * layout. Null if there is none.
 */
export const findQueuePane = (page: HTMLElement) =>
  byName(page, 'section:not([role="tabpanel"])', 'Queue');
/** The Queue notice inside `root`, naming lost cards: a status by its name. Null if there is none. */
export const queueNotice = (root: HTMLElement) =>
  byAriaLabel(root, '[role="status"]', 'Queue notice');
/**
 * The play/pause button inside `root` that pauses the queue or sets it
 * picking: by its name, which is what pressing it does. Null if there is none.
 */
export const findQueuePlayPauseButton = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((playPause) =>
    /^Set queue (paused|picking)$/.test(accessibleName(playPause)),
  ) ?? null;
/** The queue play/pause button inside `root`, which is there. */
export const queuePlayPauseButton = (root: HTMLElement) => findQueuePlayPauseButton(root)!;
/** What the statuses inside `root` say to screen readers, such as what a change just made did. */
export const queueStatuses = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role="status"]')].map((status) =>
    status.textContent?.trim(),
  );
/** The Queue pane, which is there. */
export const queuePane = (page: HTMLElement) => findQueuePane(page)!;
/**
 * The Queue pane's collapse toggle, which as its rail expands it again:
 * the button that controls the pane's body.
 */
export const queuePaneToggle = (page: HTMLElement) =>
  [...queuePane(page).querySelectorAll<HTMLButtonElement>('button[aria-controls]')].find((toggle) =>
    /^(Collapse|Expand) queue\b/.test(accessibleName(toggle)),
  )!;

/** The name of the row menu of the queued card named `card`, which moves or removes it. */
export const rowMenuName = (card: string) => `Move or remove ${card}`;
/**
 * The row menu button of the queued card named `card` inside `root`: of its
 * `copy`th copy in the queue, counting from 0, if two share a name.
 */
export const rowMenu = (root: HTMLElement, card: string, copy = 0) =>
  buttons(root, rowMenuName(card))[copy];
/** Opens the row menu of the `copy`th queued card named `card` inside `root`, answering its items' names. */
export const openRowMenu = (root: HTMLElement, card: string, copy = 0) =>
  openMenu(rowMenu(root, card, copy)!, rowMenuName(card));
/** Chooses `item` from the open row menu of `card`, as a click or tap on it does. */
export function chooseInOpenRowMenu(card: string, item: string) {
  menuItem(rowMenuName(card), item)!.click();
  TestBed.tick();
}
/** Chooses `item` from the row menu of the queued card named `card` inside `root`, opening it first. */
export function chooseInRowMenu(root: HTMLElement, card: string, item: string) {
  openRowMenu(root, card);
  chooseInOpenRowMenu(card, item);
}
