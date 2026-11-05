import { describe, expect, it } from 'vitest';
import { queuesAfterPick, swapOrLose } from './queue.js';

// Two copies of Lightning Bolt and one of Shock, keyed by pool card id.
const pool = new Map([
  ['bolt-1', 'Lightning Bolt'],
  ['bolt-2', 'Lightning Bolt'],
  ['shock', 'Shock'],
  ['spike', 'Lava Spike'],
]);

describe('queuesAfterPick', () => {
  it('takes the picked card out of the picker’s own queue, leaving the rest', () => {
    expect(
      queuesAfterPick({ seat: 0, card: 'shock' }, [['shock', 'spike'], []], {
        pool,
        picked: [],
      }),
    ).toEqual([
      { queue: ['spike'], cleared: [] },
      { queue: [], cleared: [] },
    ]);
  });

  it('swaps another queue’s copy for an available copy it doesn’t hold, in the same place', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['spike', 'bolt-1', 'shock']],
        { pool, picked: [] },
      ),
    ).toEqual([
      { queue: [], cleared: [] },
      {
        queue: ['spike', 'bolt-2', 'shock'],
        swapped: { out: 'bolt-1', in: 'bolt-2' },
        cleared: [],
      },
    ]);
  });

  it('loses the card from another queue when no copy is left for it, clearing the rest', () => {
    // bolt-2 is picked already; the queue holding Shock has no copy to swap.
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['spike', 'bolt-1'], ['shock']],
        { pool, picked: ['bolt-2'] },
      ),
    ).toEqual([
      { queue: [], cleared: [] },
      { queue: [], lost: 'bolt-1', cleared: ['spike'] },
      { queue: ['shock'], cleared: [] },
    ]);
  });

  it('under pick next, loses only the card from another queue, keeping the rest in order', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['spike', 'bolt-1', 'shock'], ['bolt-1', 'spike']],
        {
          pool,
          picked: ['bolt-2'],
          stealBehaviors: ['ClearQueue', 'PickNext', 'ClearQueue'],
        },
      ),
    ).toEqual([
      { queue: [], cleared: [] },
      { queue: ['spike', 'shock'], lost: 'bolt-1', cleared: [] },
      { queue: [], lost: 'bolt-1', cleared: ['spike'] },
    ]);
  });
});

describe('swapOrLose', () => {
  it('leaves a list that doesn’t hold the card as it is', () => {
    expect(swapOrLose(['spike'], 'bolt-1', ['bolt-2'])).toEqual({
      list: ['spike'],
    });
  });

  it('swaps the card for the first copy, in the same place', () => {
    expect(
      swapOrLose(['spike', 'bolt-1', 'shock'], 'bolt-1', ['bolt-2', 'bolt-3']),
    ).toEqual({
      list: ['spike', 'bolt-2', 'shock'],
      swapped: { out: 'bolt-1', in: 'bolt-2' },
    });
  });

  it('skips a copy the list already holds', () => {
    expect(
      swapOrLose(['bolt-2', 'bolt-1'], 'bolt-1', ['bolt-2', 'bolt-3']),
    ).toEqual({
      list: ['bolt-2', 'bolt-3'],
      swapped: { out: 'bolt-1', in: 'bolt-3' },
    });
  });

  it('loses the card when the list holds every copy, or there is none', () => {
    expect(swapOrLose(['bolt-2', 'bolt-1'], 'bolt-1', ['bolt-2'])).toEqual({
      list: ['bolt-2'],
      lost: 'bolt-1',
    });
    expect(swapOrLose(['bolt-1', 'spike'], 'bolt-1', [])).toEqual({
      list: ['spike'],
      lost: 'bolt-1',
    });
  });
});
