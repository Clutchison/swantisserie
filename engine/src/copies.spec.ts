import { describe, expect, it } from 'vitest';
import { swapOrLose } from './copies.js';

describe('swapOrLose', () => {
  it('leaves a list that doesn’t hold the card as it is', () => {
    expect(swapOrLose(['spike'], 'bolt-1', ['bolt-2'])).toEqual({
      cards: ['spike'],
    });
  });

  it('swaps the card for the first copy, in the same place', () => {
    expect(
      swapOrLose(['spike', 'bolt-1', 'shock'], 'bolt-1', ['bolt-2', 'bolt-3']),
    ).toEqual({
      cards: ['spike', 'bolt-2', 'shock'],
      swapped: { out: 'bolt-1', in: 'bolt-2' },
    });
  });

  it('skips a copy the list already holds', () => {
    expect(
      swapOrLose(['bolt-2', 'bolt-1'], 'bolt-1', ['bolt-2', 'bolt-3']),
    ).toEqual({
      cards: ['bolt-2', 'bolt-3'],
      swapped: { out: 'bolt-1', in: 'bolt-3' },
    });
  });

  it('loses the card when the list holds every copy, or there is none', () => {
    expect(swapOrLose(['bolt-2', 'bolt-1'], 'bolt-1', ['bolt-2'])).toEqual({
      cards: ['bolt-2'],
      lost: 'bolt-1',
    });
    expect(swapOrLose(['bolt-1', 'spike'], 'bolt-1', [])).toEqual({
      cards: ['spike'],
      lost: 'bolt-1',
    });
  });
});
