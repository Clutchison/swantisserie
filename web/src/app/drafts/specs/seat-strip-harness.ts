import { accessibleName, button, byAriaLabel } from '../../specs-harness';

/** The Seat strip: the region "Seats"; null if there is none. */
export const findSeatStrip = (page: HTMLElement) => byAriaLabel(page, 'section', 'Seats');

/** The Seat strip, which is there. */
export const seatStrip = (page: HTMLElement) => findSeatStrip(page)!;

/** Each seat in the Seat strip, in seat order: the image naming its player. */
export const stripSeats = (page: HTMLElement) => [
  ...seatStrip(page).querySelectorAll<HTMLElement>('[role="img"]'),
];

/** What a screen reader names each seat in the Seat strip, in seat order. */
export const stripSeatNames = (page: HTMLElement) => stripSeats(page).map(accessibleName);

/** What a screen reader names the Seat strip's list of seats, which says who picks next. */
export const seatListName = (page: HTMLElement) =>
  accessibleName(seatStrip(page).querySelector('[role="list"]')!);

/** The Seat strip's button that opens the Players popover. */
export const playersButton = (page: HTMLElement) => button(seatStrip(page), 'Players')!;

/** The Players popover open from the Seat strip: the dialog "Players"; null while it's closed. */
export const playersPopover = (page: HTMLElement) =>
  byAriaLabel(page, '[role="dialog"]', 'Players');

/**
 * The Players sheet open from the Seat strip below the desktop layout: the
 * modal dialog "Players" over the page; null while it's closed.
 */
export const playersSheet = () =>
  byAriaLabel(document.body, '[role="dialog"][aria-modal="true"]', 'Players');

/**
 * Which pulse a seat's ring plays: `loop`, the viewer's own ring pulsing
 * until they press; `beats`, the three beats of a turn change; `loop beats`,
 * which a seat should never play; or null at rest. A pulse has no accessible
 * state, so the seat says it in `data-pulse`.
 */
export const seatPulse = (seat: HTMLElement) => seat.dataset['pulse'] ?? null;
