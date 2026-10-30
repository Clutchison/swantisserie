import { describe, expect, it } from 'vitest';
import fixtureCards from './fixtures/cards.json';
import fixtureResults from './fixtures/results.json';
import { searchPool, type PoolSearchCard } from './pool-search';

const cards = fixtureCards as PoolSearchCard[];

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

  it.each([
    ['c:r', 'c:'],
    ['t:giant mv>3', 'mv'],
    ['foo:bar', 'foo:'],
    ['o:/draw/', 'regular expression'],
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
    't:',
    '!',
    't<giant',
  ])('says %s cannot be parsed', (search) => {
    const result = searchPool(cards, search);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'parse-error', message: expect.any(String) },
    });
  });
});
