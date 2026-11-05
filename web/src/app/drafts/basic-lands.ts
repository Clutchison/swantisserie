import type { BasicLand, PoolCardView } from 'contract';

const COLORS: Record<BasicLand, string[]> = {
  Plains: ['W'],
  Island: ['U'],
  Swamp: ['B'],
  Mountain: ['R'],
  Forest: ['G'],
  Wastes: [],
};

/**
 * What the page needs to show and preview a basic land that isn't in the
 * pool, as if it were a pool card: its name, type and Scryfall's image of
 * its default printing. Every platform has its basics, so which printing
 * shows doesn't matter. It has no mana cost, and its id is no pool card's.
 */
export function basicCard(land: BasicLand): PoolCardView {
  const image = (version: string) =>
    `https://api.scryfall.com/cards/named?exact=${land}&format=image&version=${version}`;
  return {
    id: `basic-${land}`,
    scryfallId: '',
    oracleId: '',
    name: land,
    set: '',
    collectorNumber: '',
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
