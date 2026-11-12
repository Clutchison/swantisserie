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

/** The Seat strip's button that opens the Players popover. */
export const playersButton = (page: HTMLElement) => button(seatStrip(page), 'Players')!;

/** The Players popover open from the Seat strip: the dialog "Players"; null while it's closed. */
export const playersPopover = (page: HTMLElement) =>
  byAriaLabel(page, '[role="dialog"]', 'Players');
