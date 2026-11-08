import type { CardFace } from 'contract';
import { describe, expect, it } from 'vitest';
import fixtureCards from './fixtures/cards.json';
import fixtureResults from './fixtures/results.json';
import { searchPool, type PoolSearchCard } from './pool-search';

const cards = fixtureCards as PoolSearchCard[];

/** A one-faced 1/1 creature, with nothing else of note but `fields`. */
function poolCard(name: string, fields: Partial<PoolSearchCard> = {}): PoolSearchCard {
  return {
    id: name,
    scryfallId: name,
    name,
    set: 'unf',
    collectorNumber: '1',
    typeLine: 'Creature — Test',
    colors: [],
    manaValue: 0,
    manaCost: '',
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
    ...fields,
  };
}

/** One face of a card, with nothing of note but `fields`. */
function cardFace(name: string, fields: Partial<CardFace> = {}): CardFace {
  return {
    name,
    typeLine: 'Creature — Test',
    oracleText: '',
    manaCost: '',
    colors: null,
    power: '1',
    toughness: '1',
    loyalty: null,
    defense: null,
    ...fields,
  };
}

/**
 * The names of the cards `search` finds. It searches fresh copies of the
 * cards, so each test indexes them itself rather than reading another test's.
 */
function namesFound(search: string, pool: PoolSearchCard[] = cards): string[] {
  const result = searchPool(structuredClone(pool), search);
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
      poolCard('Half White', { manaCost: '{H/W}{2}' }),
      poolCard('Bare Half', { manaCost: '{HW}' }),
      poolCard('Half Two', { manaCost: '{HW}{2}' }),
      poolCard('Two Halves', { manaCost: '{HW}{HW}' }), // two of one unknown symbol
      poolCard('Real Hybrid', { manaCost: '{W/U}' }),
      poolCard('Plain White', { manaCost: '{W}{2}' }),
    ];

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
      expect(namesFound(search, odd)).toEqual(names);
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

  const colorMessage = 'takes colors like wu, a name like red, azorius or quandrix, or a number.';
  const manaMessage = 'm: takes a mana cost like {2}{W}{W} or 2WW.';
  const powMessage = 'pow: takes a number or another stat like pow or mv.';
  const orMessage = '“or” needs a search on each side.';
  const andMessage = '“and” needs a search on each side.';

  it.each([
    ['"giant', 'A quote isn’t closed.'],
    ['(giant', 'A ( isn’t closed.'],
    ['giant)', 'A ) has no ( to match it.'],
    [')', 'A ) has no ( to match it.'],
    ['(giant) or )', 'A ) has no ( to match it.'],
    ['()', 'The parentheses are empty.'],
    ['(', 'The search ends too soon.'],
    ['giant or', orMessage],
    ['or giant', orMessage],
    ['giant and', andMessage],
    ['(giant and)', andMessage],
    ['and giant', andMessage],
    ['giant and or t:giant', andMessage],
    ['giant and and t:giant', andMessage],
    ['giant -', '- needs a search right after it.'],
    ['- giant', '- needs a search right after it.'],
    ['-or giant', '- needs a search after it.'],
    ['-and giant', '- needs a search after it.'],
    ['c:r (', 'The search ends too soon.'],
    ['t:', 't: needs a value.'],
    ['!', '! needs a card name after it.'],
    ['t<giant', 't: can’t be compared with <.'],
    ['c:purple', `c: ${colorMessage}`],
    ['c:w2', `c: ${colorMessage}`],
    ['c:2w', `c: ${colorMessage}`],
    ['id>=m', 'id:m can’t be compared with >=.'],
    ['id:glint', `id: ${colorMessage}`],
    ['c:sansgreen', `c: ${colorMessage}`],
    ['m:{Q}', manaMessage],
    ['m:{H2}', manaMessage],
    ['m:2W/', manaMessage],
    ['mv>big', 'mv: takes a number, even, odd or another stat like pow or mv.'],
    ['mv=3x', 'mv: takes a number, even, odd or another stat like pow or mv.'],
    ['mv<even', 'mv: can’t be compared with <.'],
    ['pow>name', powMessage],
    ['pow>x3', powMessage],
    ['pow:even', powMessage],
    ['tou:odd', 'tou: takes a number or another stat like pow or mv.'],
    ['r:legendary', 'r: takes a rarity like common or c.'],
    ['s>woe', 's: can’t be compared with >.'],
    ['is>split', 'is: can’t be compared with >.'],
    ['o:/draw', 'A regular expression isn’t closed.'],
    ['o:/(draw/', '/(draw/ isn’t a regular expression we can read.'],
    ['kw:/flying/', 'kw: can’t take a regular expression.'],
    // A syntax error wins over an unsupported keyword, and over a keyword's own error after it.
    ['usd<1 (', 'The search ends too soon.'],
    ['c:purple (', `c: ${colorMessage}`],
  ])('says %s cannot be parsed: %s', (search, message) => {
    expect(searchPool(cards, search)).toEqual({
      ok: false,
      error: { kind: 'parse-error', message },
    });
  });

  it('joins terms with "and" as with a space', () => {
    const pool = [
      poolCard('Red Giant', { colors: ['R'] }),
      poolCard('Blue Giant', { colors: ['U'] }),
    ];
    expect(namesFound('giant and c:r', pool)).toEqual(['Red Giant']);
  });

  describe('over pool cards of each color count', () => {
    const pool = [
      poolCard('Mono Red', { colors: ['R'], colorIdentity: ['R'] }),
      poolCard('Boros Pair', { colors: ['R', 'W'], colorIdentity: ['R', 'W'] }),
      poolCard('Colorless Thing'),
    ];

    it.each([
      ['c=m', ['Boros Pair']],
      ['c!=m', ['Colorless Thing', 'Mono Red']],
      ['id=multicolor', ['Boros Pair']],
      ['id!=m', ['Colorless Thing', 'Mono Red']],
      ['c<10', ['Boros Pair', 'Colorless Thing', 'Mono Red']],
      ['c:10', []],
    ])('answers %s', (search, names) => {
      expect(namesFound(search, pool)).toEqual(names);
    });
  });

  describe('over pool cards with large or twobrid mana costs', () => {
    const pool = [
      poolCard('Ten Green', { manaCost: '{10}{G}' }),
      poolCard('One Green', { manaCost: '{1}{G}' }),
      poolCard('Twelve', { manaCost: '{12}' }),
      poolCard('Eight', { manaCost: '{8}' }),
      poolCard('Twobrid', { manaCost: '{2/W}{2/W}' }),
    ];

    it.each([
      ['m=10G', ['Ten Green']],
      ['m>={10}', ['Ten Green', 'Twelve']],
      ['m<{10}', ['Eight']],
      ['m:{2/W}', ['Twobrid']],
      ['is:hybrid', ['Twobrid']],
    ])('answers %s', (search, names) => {
      expect(namesFound(search, pool)).toEqual(names);
    });
  });

  it('finds a Phyrexian symbol in oracle text for is:phyrexian', () => {
    const pool = [
      poolCard('Text Phyrexian', { oracleText: 'Add {G/U/P}.' }),
      poolCard('Plain Text', { oracleText: 'Add {G}.' }),
    ];
    expect(namesFound('is:phyrexian', pool)).toEqual(['Text Phyrexian']);
  });

  describe('over stats that are not plain whole numbers', () => {
    const pool = [
      poolCard('X Power', { power: 'X', toughness: 'X' }),
      poolCard('Two Power', { power: '2', toughness: '2', manaValue: 2 }),
      poolCard('One Power', { manaValue: 3 }),
    ];

    it.each([
      ['pow!=2', ['One Power']],
      ['pow>=0.5', ['One Power', 'Two Power']],
      ['mv<2.25', ['Two Power', 'X Power']],
    ])('answers %s', (search, names) => {
      expect(namesFound(search, pool)).toEqual(names);
    });
  });

  it('counts a creature with a line of only reminder text as French vanilla', () => {
    const pool = [
      poolCard('Reminder Line', {
        keywords: ['Flying'],
        oracleText: 'Flying\n(It can block creatures with flying.)',
      }),
    ];
    expect(namesFound('is:frenchvanilla', pool)).toEqual(['Reminder Line']);
  });

  describe('reads ~ and a face named in full in oracle text', () => {
    const pool = [
      poolCard('Kellan, the Fae-Blooded // Birthright Boon', {
        oracleText: null,
        faces: [
          cardFace('Kellan, the Fae-Blooded', {
            oracleText: 'Whenever Kellan, the Fae-Blooded attacks, draw a card.',
          }),
          cardFace('Birthright Boon', { typeLine: 'Sorcery — Adventure' }),
        ],
      }),
      poolCard('Grizzly Bears', { oracleText: 'Grizzly Bears attacks each combat if able.' }),
    ];

    it.each([
      ['o:"whenever ~ attacks"', ['Kellan, the Fae-Blooded // Birthright Boon']],
      ['o:/grizzly bears attacks/', ['Grizzly Bears']],
      ['o:/~ attacks each/', ['Grizzly Bears']],
    ])('answers %s', (search, names) => {
      expect(namesFound(search, pool)).toEqual(names);
    });
  });

  describe('reads regular expressions as Scryfall does', () => {
    const pool = [
      poolCard('Blossom', { oracleText: 'Each blossom gives you 1 life.' }),
      poolCard('Draw', { oracleText: 'Draw a card.' }),
      poolCard('Double Green', { oracleText: 'Add {G}{G}.' }),
      poolCard('Green Blue', { oracleText: 'Add {G}{U}.' }),
    ];

    it.each([
      // Plain letters that spell a shorthand after a backslash stay plain.
      ['o:/blossom/', ['Blossom']],
      // A shorthand inside brackets is kept as written: \s and m.
      ['o:/draw[,\\sm]a/', ['Draw']],
      // One after a closed bracket is expanded.
      ['o:/add[ ]\\sm/', ['Double Green', 'Green Blue']],
      // \smr counts the groups before it, so it repeats its own symbol.
      ['o:/(add) \\smr/', ['Double Green']],
      ['o:/(?:add) \\smr/', ['Double Green']],
      ['o:/[(]?add \\smr/', ['Double Green']],
    ])('answers %s', (search, names) => {
      expect(namesFound(search, pool)).toEqual(names);
    });
  });

  describe('over a double-faced card whose back has no oracle text or mana cost', () => {
    const pool = [
      poolCard('Fae Front // Bare Back', {
        manaCost: null,
        oracleText: null,
        layout: 'transform',
        faces: [
          cardFace('Fae Front', { oracleText: 'Flying', manaCost: '{U}' }),
          cardFace('Bare Back', { oracleText: null, manaCost: null }),
        ],
      }),
    ];

    it.each([
      ['is:vanilla', ['Fae Front // Bare Back']],
      ['m={U}', ['Fae Front // Bare Back']],
      ['m:W', []],
    ])('answers %s', (search, names) => {
      expect(namesFound(search, pool)).toEqual(names);
    });
  });
});
