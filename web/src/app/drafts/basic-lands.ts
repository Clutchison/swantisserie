import {
  BASIC_LANDS,
  type BasicLand,
  type BasicLandPrintingView,
  type PoolCardView,
  type PreferredPrintings,
} from 'contract';

const COLORS: Record<BasicLand, string[]> = {
  Plains: ['W'],
  Island: ['U'],
  Swamp: ['B'],
  Mountain: ['R'],
  Forest: ['G'],
  Wastes: [],
};

/**
 * Each basic land's default printing: Onslaught's first of each, and Oath of
 * the Gatewatch's plain Wastes, which Onslaught lacks.
 */
const DEFAULT_PRINTINGS: Record<BasicLand, Omit<BasicLandPrintingView, 'images'>> = {
  Plains: {
    scryfallId: '7bf7d68a-dbd0-45f3-acbb-59ee38e6057e',
    set: 'ons',
    collectorNumber: '331',
  },
  Island: {
    scryfallId: '36e062ec-df51-40c0-ad8a-2ee1cb8f8f17',
    set: 'ons',
    collectorNumber: '335',
  },
  Swamp: {
    scryfallId: '0356ae45-e5ca-46b9-8ebc-42bf4776e89c',
    set: 'ons',
    collectorNumber: '339',
  },
  Mountain: {
    scryfallId: '05f9bdca-0d54-46c7-b803-9083dfc9ee24',
    set: 'ons',
    collectorNumber: '343',
  },
  Forest: {
    scryfallId: 'b361b42d-401f-440a-bae9-35338b5dde0e',
    set: 'ons',
    collectorNumber: '347',
  },
  Wastes: {
    scryfallId: '9cc070d3-4b83-4684-9caf-063e5c473a77',
    set: 'ogw',
    collectorNumber: '183a',
  },
};

/** A basic land's default printing, with its images on Scryfall's CDN. */
function defaultPrinting(land: BasicLand): BasicLandPrintingView {
  const printing = DEFAULT_PRINTINGS[land];
  const id = printing.scryfallId;
  const image = (version: string) =>
    `https://cards.scryfall.io/${version}/front/${id[0]}/${id[1]}/${id}.jpg`;
  return {
    ...printing,
    images: { small: image('small'), normal: image('normal'), large: image('large') },
  };
}

/**
 * What the page needs to show and preview a basic land that isn't in the
 * pool, as if it were a pool card: its name, type and basic land printing,
 * `preferred` if its player has one, or else its default printing. Every
 * platform has its basics, so which printing shows doesn't matter. It has no
 * mana cost, and its id is no pool card's.
 */
export function basicCard(land: BasicLand, preferred?: BasicLandPrintingView): PoolCardView {
  const { scryfallId, set, collectorNumber, images } = preferred ?? defaultPrinting(land);
  return {
    id: `basic-${land}`,
    scryfallId,
    set,
    collectorNumber,
    name: land,
    typeLine: land === 'Wastes' ? 'Basic Land' : `Basic Land — ${land}`,
    colors: [],
    manaValue: 0,
    manaCost: '',
    oracleText: null,
    colorIdentity: COLORS[land],
    keywords: [],
    rarity: 'common',
    layout: 'normal',
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    faces: [],
    images: [images],
  };
}

/** Each basic land's card, as `basicCard` makes it, showing a player's preferred printings. */
export function basicCards(preferred: PreferredPrintings): ReadonlyMap<BasicLand, PoolCardView> {
  return new Map(BASIC_LANDS.map((land) => [land, basicCard(land, preferred[land])]));
}
