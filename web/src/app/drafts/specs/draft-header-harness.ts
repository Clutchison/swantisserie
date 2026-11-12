import { TestBed } from '@angular/core/testing';
import { byAriaLabel } from '../../specs-harness';
import { accessibleName, button } from './harness';

/** The draft header's More button, offered only with an action in its menu. */
export const moreButton = (page: HTMLElement) => button(page, 'More');

/** The open More menu, which the CDK puts outside the page; null while it's closed. */
export const moreMenu = () => byAriaLabel(document.body, '[role="menu"]', 'More');

const moreMenuItemElements = () => [
  ...(moreMenu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
];

/** The open More menu's items, by name, in order; none while it's closed. */
export const moreMenuItems = () => moreMenuItemElements().map(accessibleName);

/** The open More menu's item named `name`. */
export const moreMenuItem = (name: string) =>
  moreMenuItemElements().find((item) => accessibleName(item) === name);

/**
 * Opens the More menu with a click, as a viewer would, and returns its
 * items' names. Renders without waiting for the page to settle, which a
 * running pool snapshot's polling never lets it do.
 */
export function openMore(page: HTMLElement) {
  moreButton(page)!.click();
  TestBed.tick();
  return moreMenuItems();
}

/**
 * Chooses the More menu's item `name`, opening the menu first, as a viewer
 * would; throws if the menu doesn't offer it.
 */
export function chooseFromMore(page: HTMLElement, name: string) {
  if (!moreMenu()) openMore(page);
  const item = moreMenuItem(name);
  if (!item) throw new Error(`chooseFromMore: the More menu offers no "${name}"`);
  item.click();
  TestBed.tick();
}

/** What the More menu offers, by name, opening and closing it again; none with no More. */
export function offeredInMore(page: HTMLElement) {
  if (!moreButton(page)) return [];
  const offered = openMore(page);
  // Clicking More again closes its menu.
  moreButton(page)!.click();
  TestBed.tick();
  return offered;
}
