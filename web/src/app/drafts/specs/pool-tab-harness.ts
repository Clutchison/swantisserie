import { type PoolCardView } from '../drafts';
import { type AppFixture } from './harness';

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
  });
}

/** Scryfall's image URL for one face of a printing. */
export const image = (version: string, id: string, face = 'front') =>
  `https://cards.scryfall.io/${version}/${face}/${id}.jpg`;
export const card = (fields: Partial<PoolCardView>): PoolCardView => ({
  scryfallId: 'shivan-id',
  oracleId: 'shivan-oracle',
  name: 'Shivan Dragon',
  set: 'm20',
  collectorNumber: '332',
  typeLine: 'Creature — Dragon',
  colors: ['R'],
  manaValue: 6,
  manaCost: '{4}{R}{R}',
  oracleText: 'Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.',
  colorIdentity: ['R'],
  keywords: ['Flying'],
  rarity: 'rare',
  layout: 'normal',
  power: '5',
  toughness: '5',
  loyalty: null,
  defense: null,
  faces: [],
  images: [
    {
      small: image('small', 'shivan-id'),
      normal: image('normal', 'shivan-id'),
      large: image('large', 'shivan-id'),
    },
  ],
  ...fields,
});
export const shivan = card({});
export const brightclimb = card({
  scryfallId: 'brightclimb-id',
  oracleId: 'brightclimb-oracle',
  name: 'Brightclimb Pathway // Grimclimb Pathway',
  typeLine: 'Land // Land',
  layout: 'modal_dfc',
  colors: [],
  manaValue: 0,
  images: (['front', 'back'] as const).map((face) => ({
    small: image('small', 'brightclimb-id', face),
    normal: image('normal', 'brightclimb-id', face),
    large: image('large', 'brightclimb-id', face),
  })),
});

/** The grid's tiles, one per pool card. */
export const tiles = (page: HTMLElement) => [
  ...page.querySelectorAll<HTMLButtonElement>('[role="tabpanel"] .grid button'),
];

/** Taps the grid's `index`th card and returns the detail view it opens. */
export async function openDetail(fixture: AppFixture, page: HTMLElement, index: number) {
  tiles(page)[index].click();
  await fixture.whenStable();
  return page.querySelector<HTMLElement>('[role="dialog"]')!;
}

/** The images of the Card detail's large image, oldest first, leaving out any placeholder. */
export const largeImages = (detail: HTMLElement) => [
  ...detail.querySelectorAll<HTMLImageElement>('.large img:not(.placeholder)'),
];

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
