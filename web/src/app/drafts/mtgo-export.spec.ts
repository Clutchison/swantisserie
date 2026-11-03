import { describe, expect, it } from 'vitest';
import { mtgoExport, type MtgoExportCard } from './mtgo-export';

/** A card of the given name and layout, with an unremarkable type line. */
const card = (name: string, layout: string | null): MtgoExportCard => ({
  name,
  layout,
  typeLine: 'Instant',
});

describe('MTGO export', () => {
  it('lists one line per card, with no header', () => {
    expect(
      mtgoExport([
        { name: 'Shivan Dragon', layout: 'normal', typeLine: 'Creature — Dragon' },
        { name: 'Lightning Bolt', layout: 'normal', typeLine: 'Instant' },
      ]),
    ).toBe('1 Shivan Dragon\n1 Lightning Bolt');
  });

  it('groups copies of a card into one line with their count, where the first copy was', () => {
    expect(
      mtgoExport([
        card('Lightning Bolt', 'normal'),
        card('Shivan Dragon', 'normal'),
        card('Lightning Bolt', 'normal'),
      ]),
    ).toBe('2 Lightning Bolt\n1 Shivan Dragon');
  });

  it.each([
    [
      'transform',
      'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
      'Fable of the Mirror-Breaker',
    ],
    ['modal_dfc', 'Valki, God of Lies // Tibalt, Cosmic Impostor', 'Valki, God of Lies'],
    ['adventure', 'Bonecrusher Giant // Stomp', 'Bonecrusher Giant'],
    ['flip', 'Akki Lavarunner // Tok-Tok, Volcano Born', 'Akki Lavarunner'],
    ['reversible_card', 'Magmatic Hellkite // Magmatic Hellkite', 'Magmatic Hellkite'],
  ])('names a %s card by its front face', (layout, name, expected) => {
    expect(mtgoExport([card(name, layout)])).toBe(`1 ${expected}`);
  });

  it.each([
    ['split', 'Fire // Ice', 'Fire/Ice'],
    ['aftermath', 'Commit // Memory', 'Commit/Memory'],
  ])('names a %s card by both faces, joined by a slash', (_kind, name, expected) => {
    expect(mtgoExport([card(name, 'split')])).toBe(`1 ${expected}`);
  });

  it('names a Room by both faces, as Scryfall does', () => {
    expect(
      mtgoExport([
        {
          name: 'Unholy Annex // Ritual Chamber',
          layout: 'split',
          typeLine: 'Enchantment — Room // Enchantment — Room',
        },
      ]),
    ).toBe('1 Unholy Annex // Ritual Chamber');
  });

  it('keeps the name of a meld card, which is one face', () => {
    expect(mtgoExport([card('Bruna, the Fading Light', 'meld')])).toBe('1 Bruna, the Fading Light');
  });

  it('keeps a // that is part of a single-faced card’s name', () => {
    expect(mtgoExport([card('SP//dr, Piloted by Peni', 'normal')])).toBe(
      '1 SP//dr, Piloted by Peni',
    );
  });

  it('keeps the whole name of a card whose layout is not backfilled yet', () => {
    expect(mtgoExport([card('Commit // Memory', null)])).toBe('1 Commit // Memory');
  });
});
