import { describe, expect, it } from 'vitest';
import { arenaExport, type ArenaExportCard } from './arena-export';

/** A plan of `cards`, all on the mainboard, with no basics. */
const mainboardOf = (cards: ArenaExportCard[]) => ({ mainboard: cards, sideboard: [], basics: [] });

describe('Arena export', () => {
  it('lists one line per card under a Deck header', () => {
    expect(
      arenaExport(
        mainboardOf([
          { name: 'Shivan Dragon', layout: 'normal' },
          { name: 'Lightning Bolt', layout: 'normal' },
        ]),
      ),
    ).toBe('Deck\n1 Shivan Dragon\n1 Lightning Bolt');
  });

  it('groups copies of a card into one line with their count, where the first copy was', () => {
    expect(
      arenaExport(
        mainboardOf([
          { name: 'Lightning Bolt', layout: 'normal' },
          { name: 'Shivan Dragon', layout: 'normal' },
          { name: 'Lightning Bolt', layout: 'normal' },
        ]),
      ),
    ).toBe('Deck\n2 Lightning Bolt\n1 Shivan Dragon');
  });

  it.each([
    [
      'transform',
      'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
      'Fable of the Mirror-Breaker',
    ],
    ['modal_dfc', 'Valki, God of Lies // Tibalt, Cosmic Impostor', 'Valki, God of Lies'],
    ['adventure', 'Bonecrusher Giant // Stomp', 'Bonecrusher Giant'],
  ])('names a %s card by its front face', (layout, name, expected) => {
    expect(arenaExport(mainboardOf([{ name, layout }]))).toBe(`Deck\n1 ${expected}`);
  });

  it('names a split card by both faces', () => {
    expect(arenaExport(mainboardOf([{ name: 'Commit // Memory', layout: 'split' }]))).toBe(
      'Deck\n1 Commit // Memory',
    );
  });

  it('lists the basics after the mainboard’s other cards, by count', () => {
    expect(
      arenaExport({
        mainboard: [{ name: 'Lightning Bolt', layout: 'normal' }],
        sideboard: [],
        basics: [
          { land: 'Island', board: 'Mainboard', count: 2 },
          { land: 'Mountain', board: 'Mainboard', count: 7 },
        ],
      }),
    ).toBe('Deck\n1 Lightning Bolt\n2 Island\n7 Mountain');
  });

  it('lists the sideboard under its own header, after a blank line', () => {
    expect(
      arenaExport({
        mainboard: [{ name: 'Lightning Bolt', layout: 'normal' }],
        sideboard: [
          { name: 'Shock', layout: 'normal' },
          { name: 'Shock', layout: 'normal' },
          { name: 'Bonecrusher Giant // Stomp', layout: 'adventure' },
        ],
        basics: [{ land: 'Mountain', board: 'Mainboard', count: 7 }],
      }),
    ).toBe('Deck\n1 Lightning Bolt\n7 Mountain\n\nSideboard\n2 Shock\n1 Bonecrusher Giant');
  });
});
