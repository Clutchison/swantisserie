import { describe, expect, it } from 'vitest';
import fixtureCards from './fixtures/cards.json';
import fixtureResults from './fixtures/results.json';
import { searchPool, type PoolSearchCard } from './pool-search';

const cards = fixtureCards as PoolSearchCard[];

/** A one-faced creature costing `manaCost`, with nothing else of note. */
function poolCard(name: string, manaCost: string): PoolSearchCard {
  return {
    scryfallId: name,
    oracleId: name,
    name,
    set: 'unf',
    collectorNumber: '1',
    typeLine: 'Creature — Test',
    colors: [],
    manaValue: 0,
    manaCost,
    oracleText: '',
    colorIdentity: [],
    keywords: [],
    rarity: 'common',
    layout: 'normal',
    power: '1',
    toughness: '1',
    loyalty: null,
    defense: null,
    faces: [],
  };
}

function namesFound(search: string): string[] {
  const result = searchPool(cards, search);
  if (!result.ok) throw new Error(`${search}: ${result.error.message}`);
  return result.cards.map((card) => card.name).sort();
}

describe('pool search', () => {
  describe('finds the cards scryfall.com does', () => {
    it.each(fixtureResults)('$search', ({ search, names }) => {
      expect(namesFound(search)).toEqual(names);
    });
  });

  it('finds every card for an empty search', () => {
    expect(searchPool(cards, '')).toEqual({ ok: true, cards });
    expect(searchPool(cards, '   ')).toEqual({ ok: true, cards });
  });

  describe('over pool cards whose mana costs hold symbols it does not know', () => {
    const odd = [
      poolCard('Half White', '{H/W}{2}'),
      poolCard('Bare Half', '{HW}'),
      poolCard('Half Two', '{HW}{2}'),
      poolCard('Two Halves', '{HW}{HW}'), // two of one unknown symbol
      poolCard('Real Hybrid', '{W/U}'),
      poolCard('Plain White', '{W}{2}'),
    ];

    function oddNamesFound(search: string): string[] {
      const result = searchPool(odd, search);
      if (!result.ok) throw new Error(`${search}: ${result.error.message}`);
      return result.cards.map((card) => card.name).sort();
    }

    it.each([
      ['m:W', ['Plain White']],
      ['m:{2}', ['Half Two', 'Half White', 'Plain White']],
      ['m>{2}', ['Half Two', 'Half White', 'Plain White']],
      ['m={2}', []],
      ['m<={2}', []],
      [
        'm!={2}',
        ['Bare Half', 'Half Two', 'Half White', 'Plain White', 'Real Hybrid', 'Two Halves'],
      ],
      ['m<{W}{W}{2}', ['Plain White']],
      ['is:hybrid', ['Real Hybrid']],
      ['not:hybrid', ['Bare Half', 'Half Two', 'Half White', 'Plain White', 'Two Halves']],
      ['is:phyrexian', []],
      [
        't:creature',
        ['Bare Half', 'Half Two', 'Half White', 'Plain White', 'Real Hybrid', 'Two Halves'],
      ],
    ])('answers %s', (search, names) => {
      expect(oddNamesFound(search)).toEqual(names);
    });
  });

  it.each([
    ['usd<1', 'usd<'],
    ['t:giant f:standard', 'f:'],
    ['foo:bar', 'foo:'],
    ['is:reprint', 'is:reprint'],
    ['not:promo t:giant', 'not:promo'],
  ])('says %s is not supported here', (search, mentioned) => {
    const result = searchPool(cards, search);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported', message: expect.stringContaining(mentioned) },
    });
  });

  it.each([
    '"giant',
    '(giant',
    'giant)',
    '()',
    'giant or',
    'or giant',
    'giant -',
    '- giant',
    'c:r (',
    't:',
    '!',
    't<giant',
    'c:purple',
    'id>=m',
    'm:{Q}',
    'm:2W/',
    'mv>big',
    'mv<even',
    'pow>name',
    'r:legendary',
    's>woe',
    'is>split',
    'o:/draw',
    'o:/(draw/',
    'kw:/flying/',
  ])('says %s cannot be parsed', (search) => {
    const result = searchPool(cards, search);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'parse-error', message: expect.any(String) },
    });
  });
});
