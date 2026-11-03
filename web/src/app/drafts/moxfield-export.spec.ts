import { describe, expect, it } from 'vitest';
import { moxfieldExport, type MoxfieldExportCard } from './moxfield-export';

/** A plan of `cards`, all on the mainboard, with no basics. */
const mainboardOf = (cards: MoxfieldExportCard[]) => ({
  mainboard: cards,
  sideboard: [],
  basics: [],
});

describe('Moxfield export', () => {
  it('lists one line per card with its printing, the set code in capitals', () => {
    expect(
      moxfieldExport(
        mainboardOf([
          { name: 'Shivan Dragon', set: 'm20', collectorNumber: '335' },
          { name: 'Lightning Bolt', set: 'sta', collectorNumber: '42' },
        ]),
      ),
    ).toBe('1 Shivan Dragon (M20) 335\n1 Lightning Bolt (STA) 42');
  });

  it('groups copies of a card into one line with their count, where the first copy was', () => {
    expect(
      moxfieldExport(
        mainboardOf([
          { name: 'Lightning Bolt', set: 'sta', collectorNumber: '42' },
          { name: 'Shivan Dragon', set: 'm20', collectorNumber: '335' },
          { name: 'Lightning Bolt', set: 'sta', collectorNumber: '42' },
        ]),
      ),
    ).toBe('2 Lightning Bolt (STA) 42\n1 Shivan Dragon (M20) 335');
  });

  it('keeps every face of a multi-face card in its name', () => {
    expect(
      moxfieldExport(
        mainboardOf([{ name: 'Bonecrusher Giant // Stomp', set: 'eld', collectorNumber: '115' }]),
      ),
    ).toBe('1 Bonecrusher Giant // Stomp (ELD) 115');
  });

  it('keeps a collector number that is not only digits', () => {
    expect(
      moxfieldExport(mainboardOf([{ name: 'Shock', set: 'pm21', collectorNumber: '159s' }])),
    ).toBe('1 Shock (PM21) 159s');
  });

  it('lists the basics after the mainboard’s other cards, by count, with no printing', () => {
    expect(
      moxfieldExport({
        mainboard: [{ name: 'Lightning Bolt', set: 'sta', collectorNumber: '42' }],
        sideboard: [],
        basics: [
          { land: 'Island', count: 2 },
          { land: 'Mountain', count: 7 },
        ],
      }),
    ).toBe('1 Lightning Bolt (STA) 42\n2 Island\n7 Mountain');
  });

  it('lists the sideboard after a blank line, under its header', () => {
    expect(
      moxfieldExport({
        mainboard: [{ name: 'Lightning Bolt', set: 'sta', collectorNumber: '42' }],
        sideboard: [
          { name: 'Shock', set: 'm21', collectorNumber: '159' },
          { name: 'Shock', set: 'm21', collectorNumber: '159' },
        ],
        basics: [{ land: 'Mountain', count: 7 }],
      }),
    ).toBe('1 Lightning Bolt (STA) 42\n7 Mountain\n\nSIDEBOARD:\n2 Shock (M21) 159');
  });
});
