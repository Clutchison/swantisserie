import { describe, expect, it } from 'vitest';
import { queuesAfterPick } from './queue.js';

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
      { queue: ['spike'], unqueued: [] },
      { queue: [], unqueued: [] },
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
      { queue: [], unqueued: [] },
      {
        queue: ['spike', 'bolt-2', 'shock'],
        swapped: 'bolt-2',
        unqueued: [],
      },
    ]);
  });

  it('empties another queue holding the card when no copy is left for it', () => {
    // bolt-2 is picked already; the queue holding Shock has no copy to swap.
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['spike', 'bolt-1'], ['shock']],
        { pool, picked: ['bolt-2'] },
      ),
    ).toEqual([
      { queue: [], unqueued: [] },
      { queue: [], unqueued: ['spike', 'bolt-1'] },
      { queue: ['shock'], unqueued: [] },
    ]);
  });

  it('empties a queue that already holds every other copy', () => {
    expect(
      queuesAfterPick({ seat: 0, card: 'bolt-1' }, [[], ['bolt-2', 'bolt-1']], {
        pool,
        picked: [],
      }),
    ).toEqual([
      { queue: [], unqueued: [] },
      { queue: [], unqueued: ['bolt-2', 'bolt-1'] },
    ]);
  });
});
