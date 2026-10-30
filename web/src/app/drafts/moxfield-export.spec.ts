import { describe, expect, it } from 'vitest';
import { moxfieldExport } from './moxfield-export';

describe('Moxfield export', () => {
  it('lists one line per card with its printing, the set code in capitals', () => {
    expect(
      moxfieldExport([
        { name: 'Shivan Dragon', set: 'm20', collectorNumber: '335' },
        { name: 'Lightning Bolt', set: 'sta', collectorNumber: '42' },
      ]),
    ).toBe('1 Shivan Dragon (M20) 335\n1 Lightning Bolt (STA) 42');
  });

  it('keeps every face of a multi-face card in its name', () => {
    expect(
      moxfieldExport([{ name: 'Bonecrusher Giant // Stomp', set: 'eld', collectorNumber: '115' }]),
    ).toBe('1 Bonecrusher Giant // Stomp (ELD) 115');
  });

  it('keeps a collector number that is not only digits', () => {
    expect(moxfieldExport([{ name: 'Shock', set: 'pm21', collectorNumber: '159s' }])).toBe(
      '1 Shock (PM21) 159s',
    );
  });
});
