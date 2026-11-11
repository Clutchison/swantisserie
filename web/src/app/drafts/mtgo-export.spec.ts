import { describe, expect, it } from 'vitest';
import { mtgoExport, type MtgoExportCard } from './mtgo-export';

/** A card of the given name and layout, with an unremarkable type line. */
const card = (name: string, layout: string): MtgoExportCard => ({
  name,
  layout,
  typeLine: 'Instant',
});

/** A plan of `cards`, all on the mainboard, with no basics. */
const mainboardOf = (cards: MtgoExportCard[]) => ({ mainboard: cards, sideboard: [], basics: [] });

describe('MTGO export', () => {
  it('lists one line per card, with no header', () => {
    expect(
      mtgoExport(
        mainboardOf([
          { name: 'Shivan Dragon', layout: 'normal', typeLine: 'Creature — Dragon' },
          { name: 'Lightning Bolt', layout: 'normal', typeLine: 'Instant' },
        ]),
      ),
    ).toBe('1 Shivan Dragon\n1 Lightning Bolt');
  });

  it('groups copies of a card into one line with their count, where the first copy was', () => {
    expect(
      mtgoExport(
        mainboardOf([
          card('Lightning Bolt', 'normal'),
          card('Shivan Dragon', 'normal'),
          card('Lightning Bolt', 'normal'),
        ]),
      ),
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
    ['prepare', 'Emeritus of Abundance // Regrowth', 'Emeritus of Abundance'],
    ['flip', 'Akki Lavarunner // Tok-Tok, Volcano Born', 'Akki Lavarunner'],
    ['reversible_card', 'Magmatic Hellkite // Magmatic Hellkite', 'Magmatic Hellkite'],
  ])('names a %s card by its front face', (layout, name, expected) => {
    expect(mtgoExport(mainboardOf([card(name, layout)]))).toBe(`1 ${expected}`);
  });

  it.each([
    // Scryfall lays out aftermath cards as split cards too.
    ['Fire // Ice', 'Fire/Ice'],
    ['Commit // Memory', 'Commit/Memory'],
  ])('names split card %s by both faces, joined by a slash', (name, expected) => {
    expect(mtgoExport(mainboardOf([card(name, 'split')]))).toBe(`1 ${expected}`);
  });

  it('names a Room by both faces, as Scryfall does', () => {
    expect(
      mtgoExport(
        mainboardOf([
          {
            name: 'Unholy Annex // Ritual Chamber',
            layout: 'split',
            typeLine: 'Enchantment — Room // Enchantment — Room',
          },
        ]),
      ),
    ).toBe('1 Unholy Annex // Ritual Chamber');
  });

  it('keeps the name of a meld card, which is one face', () => {
    expect(mtgoExport(mainboardOf([card('Bruna, the Fading Light', 'meld')]))).toBe(
      '1 Bruna, the Fading Light',
    );
  });

  it('keeps a // that is part of a single-faced card’s name', () => {
    expect(mtgoExport(mainboardOf([card('SP//dr, Piloted by Peni', 'normal')]))).toBe(
      '1 SP//dr, Piloted by Peni',
    );
  });

  it('lists the basics after the mainboard’s other cards, by count', () => {
    expect(
      mtgoExport({
        mainboard: [card('Lightning Bolt', 'normal')],
        sideboard: [],
        basics: [
          { land: 'Island', board: 'Mainboard', count: 2 },
          { land: 'Mountain', board: 'Mainboard', count: 7 },
        ],
      }),
    ).toBe('1 Lightning Bolt\n2 Island\n7 Mountain');
  });

  it('lists the sideboard after a blank line, with no header', () => {
    expect(
      mtgoExport({
        mainboard: [card('Lightning Bolt', 'normal')],
        sideboard: [card('Fire // Ice', 'split'), card('Shock', 'normal'), card('Shock', 'normal')],
        basics: [{ land: 'Mountain', board: 'Mainboard', count: 7 }],
      }),
    ).toBe('1 Lightning Bolt\n7 Mountain\n\n1 Fire/Ice\n2 Shock');
  });

  it('lists the sideboard’s basics after its other cards, and the mainboard’s in the mainboard', () => {
    expect(
      mtgoExport({
        mainboard: [card('Lightning Bolt', 'normal')],
        sideboard: [card('Shock', 'normal')],
        basics: [
          { land: 'Mountain', board: 'Mainboard', count: 7 },
          { land: 'Island', board: 'Sideboard', count: 2 },
          { land: 'Mountain', board: 'Sideboard', count: 1 },
        ],
      }),
    ).toBe('1 Lightning Bolt\n7 Mountain\n\n1 Shock\n2 Island\n1 Mountain');
  });

  it('lists a sideboard that holds only basics', () => {
    expect(
      mtgoExport({
        mainboard: [card('Lightning Bolt', 'normal')],
        sideboard: [],
        basics: [{ land: 'Island', board: 'Sideboard', count: 3 }],
      }),
    ).toBe('1 Lightning Bolt\n\n3 Island');
  });
});
