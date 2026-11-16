import { describe, expect, it } from 'vitest';
import { swapOrLose } from './copies.js';
import { onBoards } from './queue.fixtures.js';

describe('swapOrLose', () => {
  it('leaves a queue that doesn’t hold the card as it is', () => {
    expect(swapOrLose(onBoards(['spike']), 'bolt-1', ['bolt-2'])).toEqual({
      queue: onBoards(['spike']),
    });
  });

  it('swaps the card for the first copy, in the same place', () => {
    expect(
      swapOrLose(onBoards(['spike', 'bolt-1', 'shock']), 'bolt-1', [
        'bolt-2',
        'bolt-3',
      ]),
    ).toEqual({
      queue: onBoards(['spike', 'bolt-2', 'shock']),
      swapped: { out: 'bolt-1', in: 'bolt-2' },
    });
  });

  it('keeps the swapped-in copy on the deck board of the one it replaces', () => {
    expect(
      swapOrLose(onBoards(['bolt-1'], ['bolt-1']), 'bolt-1', ['bolt-2']).queue,
    ).toEqual(onBoards(['bolt-2'], ['bolt-2']));
  });

  it('skips a copy the queue already holds', () => {
    expect(
      swapOrLose(onBoards(['bolt-2', 'bolt-1']), 'bolt-1', [
        'bolt-2',
        'bolt-3',
      ]),
    ).toEqual({
      queue: onBoards(['bolt-2', 'bolt-3']),
      swapped: { out: 'bolt-1', in: 'bolt-3' },
    });
  });

  it('loses the card when the queue holds every copy, or there is none', () => {
    expect(
      swapOrLose(onBoards(['bolt-2', 'bolt-1']), 'bolt-1', ['bolt-2']),
    ).toEqual({ queue: onBoards(['bolt-2']), lost: 'bolt-1' });
    expect(swapOrLose(onBoards(['bolt-1', 'spike']), 'bolt-1', [])).toEqual({
      queue: onBoards(['spike']),
      lost: 'bolt-1',
    });
  });
});
