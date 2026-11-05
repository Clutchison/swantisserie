import type { BasicLand, PoolCardView } from 'contract';

const COLORS: Record<BasicLand, string[]> = {
  Plains: ['W'],
  Island: ['U'],
  Swamp: ['B'],
  Mountain: ['R'],
  Forest: ['G'],
  Wastes: [],
};

/** One plain printing of a basic land on Scryfall. */
interface Printing {
  scryfallId: string;
  oracleId: string;
  set: string;
  collectorNumber: string;
}

/**
 * The printing each basic land shows: Onslaught's first of each, and Oath of
 * the Gatewatch's plain Wastes, which Onslaught lacks.
 */
const PRINTINGS: Record<BasicLand, Printing> = {
  Plains: {
    scryfallId: '7bf7d68a-dbd0-45f3-acbb-59ee38e6057e',
    oracleId: 'bc71ebf6-2056-41f7-be35-b2e5c34afa99',
    set: 'ons',
    collectorNumber: '331',
  },
  Island: {
    scryfallId: '36e062ec-df51-40c0-ad8a-2ee1cb8f8f17',
    oracleId: 'b2c6aa39-2d2a-459c-a555-fb48ba993373',
    set: 'ons',
    collectorNumber: '335',
  },
  Swamp: {
    scryfallId: '0356ae45-e5ca-46b9-8ebc-42bf4776e89c',
    oracleId: '56719f6a-1a6c-4c0a-8d21-18f7d7350b68',
    set: 'ons',
    collectorNumber: '339',
  },
  Mountain: {
    scryfallId: '05f9bdca-0d54-46c7-b803-9083dfc9ee24',
    oracleId: 'a3fb7228-e76b-4e96-a40e-20b5fed75685',
    set: 'ons',
    collectorNumber: '343',
  },
  Forest: {
    scryfallId: 'b361b42d-401f-440a-bae9-35338b5dde0e',
    oracleId: 'b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6',
    set: 'ons',
    collectorNumber: '347',
  },
  Wastes: {
    scryfallId: '9cc070d3-4b83-4684-9caf-063e5c473a77',
    oracleId: '05d24b0c-904a-46b6-b42a-96a4d91a0dd4',
    set: 'ogw',
    collectorNumber: '183a',
  },
};

/**
 * What the page needs to show and preview a basic land that isn't in the
 * pool, as if it were a pool card: its name, type and one fixed printing, with
 * that printing's images on Scryfall's CDN. Every platform has its basics, so
 * which printing shows doesn't matter. It has no mana cost, and its id is no
 * pool card's.
 */
export function basicCard(land: BasicLand): PoolCardView {
  const printing = PRINTINGS[land];
  const id = printing.scryfallId;
  const image = (version: string) =>
    `https://cards.scryfall.io/${version}/front/${id[0]}/${id[1]}/${id}.jpg`;
  return {
    id: `basic-${land}`,
    ...printing,
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
    images: [{ small: image('small'), normal: image('normal'), large: image('large') }],
  };
}
