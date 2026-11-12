import { accessibleName, byAriaLabel, byName, text } from '../../specs-harness';
import { type AppFixture, cardNames, namedList } from './harness';

/** The list of the cards in the signed-in player's queue, inside `root`, by its name. */
export const queueList = (root: HTMLElement) => namedList(root, 'Your queue');

/** The rows of the queue inside `root` that a screen reader hears as just added. */
const justAddedRows = (root: HTMLElement) =>
  [...queueList(root).querySelectorAll<HTMLElement>('li')].filter((row) =>
    accessibleName(row).includes('just added'),
  );
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
/** The Queue notice inside `root`, naming lost and cleared cards: a status by its name. Null if there is none. */
export const queueNotice = (root: HTMLElement) =>
  byAriaLabel(root, '[role="status"]', 'Queue notice');
/** The switch inside `root` that pauses the queue or sets it picking, named for the state it is in. */
export const queuePausedSwitch = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('button[role="switch"]')!;
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
