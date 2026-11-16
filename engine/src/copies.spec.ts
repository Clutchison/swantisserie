import { describe, expect, it } from 'vitest';
import { swapOrLose } from './copies.js';

/** Entries for `cards`, in order. */
function listOf(...cards: string[]) {
  return cards.map((card) => ({ card }));
}

describe('swapOrLose', () => {
  it('leaves a list that doesn’t hold the card as it is', () => {
    expect(swapOrLose(listOf('spike'), 'bolt-1', ['bolt-2'])).toEqual({
      list: listOf('spike'),
    });
  });

  it('swaps the card for the first copy, in the same place', () => {
    expect(
      swapOrLose(listOf('spike', 'bolt-1', 'shock'), 'bolt-1', [
        'bolt-2',
        'bolt-3',
      ]),
    ).toEqual({
      list: listOf('spike', 'bolt-2', 'shock'),
      swapped: { out: 'bolt-1', in: 'bolt-2' },
    });
  });

  it('keeps the rest of the swapped entry, such as its deck board', () => {
    expect(
      swapOrLose([{ card: 'bolt-1', board: 'Sideboard' }], 'bolt-1', ['bolt-2'])
        .list,
    ).toEqual([{ card: 'bolt-2', board: 'Sideboard' }]);
  });

  it('skips a copy the list already holds', () => {
    expect(
      swapOrLose(listOf('bolt-2', 'bolt-1'), 'bolt-1', ['bolt-2', 'bolt-3']),
    ).toEqual({
      list: listOf('bolt-2', 'bolt-3'),
      swapped: { out: 'bolt-1', in: 'bolt-3' },
    });
  });

  it('loses the card when the list holds every copy, or there is none', () => {
    expect(
      swapOrLose(listOf('bolt-2', 'bolt-1'), 'bolt-1', ['bolt-2']),
    ).toEqual({ list: listOf('bolt-2'), lost: 'bolt-1' });
    expect(swapOrLose(listOf('bolt-1', 'spike'), 'bolt-1', [])).toEqual({
      list: listOf('spike'),
      lost: 'bolt-1',
    });
  });
});
