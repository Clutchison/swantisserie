import { describe, expect, it } from 'vitest';
import { capitalised, percent, record } from './record';

describe('page formatting', () => {
  it('reads a record as won–lost–drawn', () => {
    expect(record({ won: 2, lost: 1, drawn: 0 })).toBe('2–1–0');
  });

  it('reads a percentage rounded, with a % sign, and empty when absent', () => {
    expect(percent(66.666)).toBe('67%');
    expect(percent(33.3)).toBe('33%');
    expect(percent(0)).toBe('0%');
    expect(percent(undefined)).toBe('');
  });

  it('capitalises a result to start a line with it', () => {
    expect(capitalised('won')).toBe('Won');
    expect(capitalised('lost')).toBe('Lost');
  });
});
