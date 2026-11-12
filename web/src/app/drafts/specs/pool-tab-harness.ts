import { TestBed } from '@angular/core/testing';
import type { PoolCardView } from 'contract';
import { button, openDialog } from '../../specs-harness';
import { type AppFixture, faceImages, poolCardOf } from './harness';

export { image } from './harness';

// jsdom lays nothing out, so the window is 0px tall and the grid, which
// only renders the rows on screen, would render just a few. Give it a
// phone-sized screen instead.
export function useTallScreen() {
  beforeEach(() => {
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 800,
    });
  });
  afterEach(() => {
    delete (document.documentElement as { clientHeight?: number }).clientHeight;
    delete (document.documentElement as { scrollTop?: number }).scrollTop;
  });
}

/** Scrolls the page `top` px down, as a viewer scrolling the grid would; jsdom keeps it at the top otherwise. */
export function scrollWindowTo(top: number) {
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: top });
  document.dispatchEvent(new Event('scroll'));
}

/** A pool card, Shivan Dragon unless `fields` change it. */
export const card = (fields: Partial<PoolCardView>): PoolCardView =>
  poolCardOf('shivan', 'Shivan Dragon', {
    set: 'm20',
    collectorNumber: '332',
    typeLine: 'Creature — Dragon',
    manaValue: 6,
    manaCost: '{4}{R}{R}',
    oracleText: 'Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.',
    keywords: ['Flying'],
    rarity: 'rare',
    power: '5',
    toughness: '5',
    ...fields,
  });
export const shivan = card({});
export const brightclimb = card({
  id: 'brightclimb-card',
  scryfallId: 'brightclimb-id',
  name: 'Brightclimb Pathway // Grimclimb Pathway',
  typeLine: 'Land // Land',
  layout: 'modal_dfc',
  colors: [],
  manaValue: 0,
  images: faceImages('brightclimb-id', ['front', 'back']),
});

/** The grid's tiles, one per pool card. */
export const tiles = (page: HTMLElement) => [
  ...page.querySelectorAll<HTMLButtonElement>('[role="tabpanel"] .grid button'),
];

/** Taps the grid's `index`th card and returns the Card detail it opens. */
export async function openDetail(fixture: AppFixture, page: HTMLElement, index: number) {
  tiles(page)[index].click();
  await fixture.whenStable();
  return openDialog()!;
}

/** The pool search box. */
/** The Hide picked toggle button, by its role and name. */
export const hidePicked = (page: HTMLElement) => button(page, 'Hide picked');

export const searchBox = (page: HTMLElement) =>
  page.querySelector<HTMLInputElement>('input[type="search"]')!;

/** Types `search` into the pool search box. */
export function searchFor(page: HTMLElement, search: string) {
  const box = searchBox(page);
  box.value = search;
  box.dispatchEvent(new Event('input'));
  TestBed.tick();
}

/** The Card detail's large image, named as such: its images, and whatever shows while they load. */
const largeImage = (detail: HTMLElement) =>
  detail.querySelector<HTMLElement>('[role="group"][aria-label="Large image"]')!;

/** The images of the Card detail's large image, oldest first, leaving out any placeholder. */
export const largeImages = (detail: HTMLElement) => [
  ...largeImage(detail).querySelectorAll<HTMLImageElement>('img:not([aria-hidden="true"])'),
];

/** What the Card detail's large image shows while its image loads, hidden from screen readers, if anything. */
export const largePlaceholder = (detail: HTMLElement) =>
  largeImage(detail).querySelector<HTMLElement>('[aria-hidden="true"]');

/** The latest image the Card detail has asked for. */
export const newestLarge = (detail: HTMLElement) => largeImages(detail).at(-1)!;

/** Has a tile's image finished loading, as `currentSrc` was the one the browser chose. */
export function tileLoaded(tile: HTMLElement, currentSrc: string) {
  Object.defineProperties(tile.querySelector('img')!, {
    complete: { value: true },
    naturalWidth: { value: 488 },
    currentSrc: { value: currentSrc },
  });
}
