import { describe, expect, it } from 'vitest';
import { arenaExport } from './arena-export';

describe('Arena export', () => {
  it('lists one line per card under a Deck header', () => {
    expect(
      arenaExport([
        { name: 'Shivan Dragon', layout: 'normal' },
        { name: 'Lightning Bolt', layout: 'normal' },
      ]),
    ).toBe('Deck\n1 Shivan Dragon\n1 Lightning Bolt');
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
    expect(arenaExport([{ name, layout }])).toBe(`Deck\n1 ${expected}`);
  });

  it('names a split card by both faces', () => {
    expect(arenaExport([{ name: 'Commit // Memory', layout: 'split' }])).toBe(
      'Deck\n1 Commit // Memory',
    );
  });

  it('keeps the whole name of a card whose layout is not backfilled yet', () => {
    expect(arenaExport([{ name: 'Commit // Memory', layout: null }])).toBe(
      'Deck\n1 Commit // Memory',
    );
  });
});
