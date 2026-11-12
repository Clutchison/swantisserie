import { describe, expect, it } from 'vitest';
import { capitalised, ordinalWords, percent, place, record } from './record';

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

  it('reads a place as an ordinal, marked with = when shared', () => {
    expect(place({ rank: 1, shared: false })).toBe('1st');
    expect(place({ rank: 2, shared: true })).toBe('=2nd');
    expect(place({ rank: 3, shared: false })).toBe('3rd');
    expect(place({ rank: 4, shared: false })).toBe('4th');
    expect(place({ rank: 11, shared: false })).toBe('11th');
    expect(place({ rank: 12, shared: false })).toBe('12th');
    expect(place({ rank: 13, shared: true })).toBe('=13th');
    expect(place({ rank: 21, shared: false })).toBe('21st');
    expect(place({ rank: 22, shared: false })).toBe('22nd');
    expect(place({ rank: 103, shared: false })).toBe('103rd');
    expect(place({ rank: 111, shared: false })).toBe('111th');
  });

  it('reads a place in a list in words, then in digits past 99', () => {
    expect(ordinalWords(1)).toBe('first');
    expect(ordinalWords(3)).toBe('third');
    expect(ordinalWords(12)).toBe('twelfth');
    expect(ordinalWords(19)).toBe('nineteenth');
    expect(ordinalWords(20)).toBe('twentieth');
    expect(ordinalWords(23)).toBe('twenty-third');
    expect(ordinalWords(40)).toBe('fortieth');
    expect(ordinalWords(99)).toBe('ninety-ninth');
    expect(ordinalWords(100)).toBe('100th');
  });

  it('capitalises a result to start a line with it', () => {
    expect(capitalised('won')).toBe('Won');
    expect(capitalised('lost')).toBe('Lost');
  });
});
