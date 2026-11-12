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
      { queue: ['spike'], paused: false },
      { queue: [], paused: false },
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
      { queue: [], paused: false },
      {
        queue: ['spike', 'bolt-2', 'shock'],
        swapped: { out: 'bolt-1', in: 'bolt-2' },
        paused: false,
      },
    ]);
  });

  it('under pause queue, loses the card from another queue, keeping the rest in order and pausing the queue', () => {
    // bolt-2 is picked already; the queue holding Shock has no copy to swap.
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['spike', 'bolt-1', 'shock'], ['shock']],
        { pool, picked: ['bolt-2'] },
      ),
    ).toEqual([
      { queue: [], paused: false },
      { queue: ['spike', 'shock'], lost: 'bolt-1', paused: true },
      { queue: ['shock'], paused: false },
    ]);
  });

  it('under pick next, loses only the card from another queue, keeping the rest in order and the queue picking', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['spike', 'bolt-1', 'shock'], ['bolt-1', 'spike']],
        {
          pool,
          picked: ['bolt-2'],
          stealBehaviors: ['PauseQueue', 'PickNext', 'PauseQueue'],
        },
      ),
    ).toEqual([
      { queue: [], paused: false },
      { queue: ['spike', 'shock'], lost: 'bolt-1', paused: false },
      { queue: ['spike'], lost: 'bolt-1', paused: true },
    ]);
  });

  it('doesn’t say a pick paused a queue that was queue paused already, under either steal behavior', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['bolt-1', 'spike'], ['spike', 'bolt-1']],
        {
          pool,
          picked: ['bolt-2'],
          stealBehaviors: ['PauseQueue', 'PauseQueue', 'PickNext'],
          queuesPaused: [false, true, true],
        },
      ),
    ).toEqual([
      { queue: [], paused: false },
      { queue: ['spike'], lost: 'bolt-1', paused: false },
      { queue: ['spike'], lost: 'bolt-1', paused: false },
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

  it('puts a cleared queue back at the front even when cards queued since sit at lower places', () => {
    // Skewer was queued at 0 after Shock and Bolt were cleared from 1 and 2.
    expect(
      queueAfterUndo(
        [{ card: 'skewer', position: 0 }],
        [
          { card: 'shock', position: 1 },
          { card: 'bolt', position: 2 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });

  it('leaves a kept queue as it is when the pick took nothing out of it', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'shock', position: 0 },
          { card: 'spike', position: 1 },
        ],
        [],
        { restKept: true },
      ),
    ).toEqual(['shock', 'spike']);
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
