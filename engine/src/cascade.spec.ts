import { describe, expect, it } from 'vitest';
import { cascade } from './cascade.js';

// A pool holding one copy of each card.
const singles = new Map(
  ['shock', 'bolt', 'spike', 'skewer', 'fireblast'].map((card) => [card, card]),
);

describe('cascade', () => {
  it('picks the first card in the queue of the seat whose turn it is', () => {
    expect(
      cascade(
        { players: 2, picksPerPlayer: 2, picked: [] },
        [['shock', 'bolt'], []],
        singles,
      ),
    ).toEqual([{ seat: 0, card: 'shock' }]);
  });

  it('carries on through each next seat with a queued card, across the snake turn', () => {
    // Seat 1 picks last in round 1 and first in round 2.
    expect(
      cascade(
        { players: 2, picksPerPlayer: 3, picked: [] },
        [
          ['shock', 'bolt'],
          ['spike', 'skewer', 'fireblast'],
        ],
        singles,
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'spike' },
      { seat: 1, card: 'skewer' },
      { seat: 0, card: 'bolt' },
      // Seat 0 starts round 3 with nothing left queued.
    ]);
  });

  it('skips queued cards picked before the cascade', () => {
    expect(
      cascade(
        { players: 2, picksPerPlayer: 2, picked: ['shock'] },
        [[], ['shock', 'bolt']],
        singles,
      ),
    ).toEqual([{ seat: 1, card: 'bolt' }]);
  });

  it('stops at a seat whose queue another seat cleared earlier in the cascade', () => {
    expect(
      cascade(
        { players: 3, picksPerPlayer: 2, picked: [] },
        [['shock', 'spike'], ['shock', 'bolt'], ['skewer']],
        singles,
      ),
    ).toEqual([{ seat: 0, card: 'shock' }]);
  });

  it('carries on to a seat whose queued card the cascade swapped for another copy', () => {
    expect(
      cascade(
        { players: 3, picksPerPlayer: 1, picked: [] },
        [['bolt-1'], ['bolt-1'], []],
        new Map([
          ['bolt-1', 'Lightning Bolt'],
          ['bolt-2', 'Lightning Bolt'],
        ]),
      ),
    ).toEqual([
      { seat: 0, card: 'bolt-1' },
      { seat: 1, card: 'bolt-2' },
    ]);
  });

  it('leaves the rest of a queue in place after its own seat picks from it', () => {
    // Shock leaves seat 0's queue, and Bolt is still there for its next turn.
    expect(
      cascade(
        { players: 2, picksPerPlayer: 2, picked: [] },
        [
          ['shock', 'bolt'],
          ['spike', 'skewer'],
        ],
        singles,
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'spike' },
      { seat: 1, card: 'skewer' },
      { seat: 0, card: 'bolt' },
    ]);
  });

  it('stops at a seat whose queued cards have all been picked', () => {
    expect(
      cascade(
        { players: 2, picksPerPlayer: 2, picked: ['shock'] },
        [['bolt'], ['shock']],
        singles,
      ),
    ).toEqual([]);
  });

  it('stops once every pick is made', () => {
    expect(
      cascade(
        { players: 2, picksPerPlayer: 1, picked: [] },
        [
          ['shock', 'spike'],
          ['bolt', 'skewer'],
        ],
        singles,
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'bolt' },
    ]);
  });
});
