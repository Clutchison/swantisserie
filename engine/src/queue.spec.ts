import { describe, expect, it } from 'vitest';
import { queueAfterUndo, queuesAfterPick } from './queue.js';

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

describe('queueAfterUndo', () => {
  it('puts a card lost under pick next back in its old place', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'shock', position: 0 },
          { card: 'spike', position: 2 },
        ],
        [{ card: 'bolt', position: 1 }],
        { restKept: true },
      ),
    ).toEqual(['shock', 'bolt', 'spike']);
  });

  it('puts a card lost under pick next back after as many cards as were ahead of it, once the queue has changed', () => {
    // Spike was moved to the front and Skewer queued; one card is ahead of Bolt's old place.
    expect(
      queueAfterUndo(
        [
          { card: 'spike', position: 0 },
          { card: 'shock', position: 1 },
          { card: 'skewer', position: 2 },
        ],
        [{ card: 'bolt', position: 1 }],
        { restKept: true },
      ),
    ).toEqual(['spike', 'bolt', 'shock', 'skewer']);
  });

  it('puts a cleared queue back at the front, in its order, ahead of cards queued since', () => {
    expect(
      queueAfterUndo(
        [{ card: 'skewer', position: 0 }],
        [
          { card: 'shock', position: 0 },
          { card: 'bolt', position: 1 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });

  it('holds a taken-out card queued again since only once', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'bolt', position: 0 },
          { card: 'skewer', position: 1 },
        ],
        [
          { card: 'shock', position: 0 },
          { card: 'bolt', position: 1 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });
});
