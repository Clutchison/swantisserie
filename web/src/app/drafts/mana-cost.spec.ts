import { describe, expect, it } from 'vitest';
import { manaCostOf } from './mana-cost';

const face = (manaCost: string | null) => ({ manaCost });

describe('mana cost', () => {
  it('is the card’s cost as symbols, each with its SVG and description', () => {
    expect(manaCostOf({ manaCost: '{2}{U}', faces: [] })).toEqual([
      { text: '{2}', src: 'mana/2.svg', description: 'two generic mana' },
      { text: '{U}', src: 'mana/U.svg', description: 'one blue mana' },
    ]);
  });

  it('is the front face’s cost on a double-faced or modal double-faced card', () => {
    expect(manaCostOf({ manaCost: null, faces: [face('{1}{B}'), face('{3}{B}')] })).toEqual([
      { text: '{1}', src: 'mana/1.svg', description: 'one generic mana' },
      { text: '{B}', src: 'mana/B.svg', description: 'one black mana' },
    ]);
  });

  const U = { text: '{U}', src: 'mana/U.svg', description: 'one blue mana' };
  const GW = { text: '{G/W}', src: 'mana/GW.svg', description: 'one green or white mana' };
  const ONE = { text: '{1}', src: 'mana/1.svg', description: 'one generic mana' };

  it.each([
    ['a split card', '{G/W}{G/W} // {4}{G}{W}', [GW, GW]],
    ['a Room', '{U} // {4}{U}', [U]],
    ['an adventure card', '{1}{U} // {2}{U}', [ONE, U]],
  ])('is only the first face’s cost on %s', (_, manaCost, symbols) => {
    const [first, second] = manaCost.split(' // ');
    expect(manaCostOf({ manaCost, faces: [face(first), face(second)] })).toEqual(symbols);
  });

  it.each([
    ['a land', { manaCost: '', faces: [] }],
    [
      'a double-faced card whose front has no cost',
      { manaCost: null, faces: [face(''), face('')] },
    ],
  ])('is nothing on %s', (_, card) => {
    expect(manaCostOf(card)).toEqual([]);
  });

  it('shows a real {0} cost', () => {
    expect(manaCostOf({ manaCost: '{0}', faces: [] })).toEqual([
      { text: '{0}', src: 'mana/0.svg', description: 'zero mana' },
    ]);
  });

  it.each([
    ['generic', '{12}', 'mana/12.svg', 'twelve generic mana'],
    ['X', '{X}', 'mana/X.svg', 'X generic mana'],
    ['hybrid', '{W/U}', 'mana/WU.svg', 'one white or blue mana'],
    ['Phyrexian', '{G/P}', 'mana/GP.svg', 'one green mana or two life'],
    ['two-generic hybrid', '{2/W}', 'mana/2W.svg', 'two generic mana or one white mana'],
    ['snow', '{S}', 'mana/S.svg', 'one snow mana'],
  ])('has the SVG and description of a %s symbol', (_, text, src, description) => {
    expect(manaCostOf({ manaCost: text, faces: [] })).toEqual([{ text, src, description }]);
  });

  it('leaves a symbol the app has no SVG for as its text', () => {
    expect(manaCostOf({ manaCost: '{H}{R}', faces: [] })).toEqual([
      { text: '{H}' },
      { text: '{R}', src: 'mana/R.svg', description: 'one red mana' },
    ]);
  });
});
