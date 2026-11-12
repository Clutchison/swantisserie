import { TestBed } from '@angular/core/testing';
import { menu, menuItem, openMenu } from '../../specs-harness';
import { button } from './harness';

/** The draft header's More button, offered only with an action in its menu. */
export const moreButton = (page: HTMLElement) => button(page, 'More');

/** Opens the More menu with a click, as a viewer would, and returns its items' names. */
export const openMore = (page: HTMLElement) => openMenu(moreButton(page)!, 'More');

/**
 * Chooses the More menu's item `name`, opening the menu first, as a viewer
 * would; throws if the menu doesn't offer it.
 */
export function chooseFromMore(page: HTMLElement, name: string) {
  if (!menu('More')) openMore(page);
  const item = menuItem('More', name);
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
